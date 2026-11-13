import {
  createHash,
  createSign,
  generateKeyPairSync,
  randomBytes,
} from 'node:crypto';

/**
 * A software WebAuthn authenticator (ES256, "none" attestation, user verification always done)
 * for tests: it answers `startRegistration()` / `startAuthentication()` the way a browser would,
 * as the JSON the server expects. Test code only; never use it in app code.
 */
export class VirtualAuthenticator {
  readonly credentialId = randomBytes(16);
  private readonly keys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  private counter = 0;

  constructor(
    private readonly rpID: string,
    private readonly origin: string,
  ) {}

  /** The answer to a registration challenge; `userHandle` is stored with the credential. */
  register(
    challenge: string,
    overrides: { origin?: string; type?: string } = {},
  ): Record<string, unknown> {
    const jwk = this.keys.publicKey.export({ format: 'jwk' });
    const x = Buffer.from(jwk.x as string, 'base64url');
    const y = Buffer.from(jwk.y as string, 'base64url');
    // COSE key: {1: 2 (EC2), 3: -7 (ES256), -1: 1 (P-256), -2: x, -3: y}
    const coseKey = Buffer.concat([
      Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
      x,
      Buffer.from([0x22, 0x58, 0x20]),
      y,
    ]);
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([
      this.rpIdHash(),
      Buffer.from([0x45]), // user present, user verified, attested credential data
      Buffer.alloc(4), // counter
      Buffer.alloc(16), // AAGUID
      idLength,
      this.credentialId,
      coseKey,
    ]);
    // {"fmt": "none", "attStmt": {}, "authData": <bytes>}
    const authDataLength = Buffer.alloc(2);
    authDataLength.writeUInt16BE(authData.length);
    const attestationObject = Buffer.concat([
      Buffer.from([0xa3]),
      Buffer.from([0x63, ...Buffer.from('fmt')]),
      Buffer.from([0x64, ...Buffer.from('none')]),
      Buffer.from([0x67, ...Buffer.from('attStmt'), 0xa0]),
      Buffer.from([0x68, ...Buffer.from('authData'), 0x59]),
      authDataLength,
      authData,
    ]);
    return {
      id: this.credentialId.toString('base64url'),
      rawId: this.credentialId.toString('base64url'),
      type: 'public-key',
      response: {
        clientDataJSON: this.clientData(
          overrides.type ?? 'webauthn.create',
          challenge,
          overrides.origin,
        ).toString('base64url'),
        attestationObject: attestationObject.toString('base64url'),
        transports: ['internal'],
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }

  /** The answer to a sign-in challenge, for the user whose id was given at registration. */
  authenticate(
    challenge: string,
    userId: string,
    overrides: { origin?: string; signWith?: VirtualAuthenticator } = {},
  ): Record<string, unknown> {
    this.counter += 1;
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    const authData = Buffer.concat([
      this.rpIdHash(),
      Buffer.from([0x05]),
      counter,
    ]);
    const clientData = this.clientData(
      'webauthn.get',
      challenge,
      overrides.origin,
    );
    const signer = overrides.signWith ?? this;
    const signature = createSign('sha256')
      .update(
        Buffer.concat([
          authData,
          createHash('sha256').update(clientData).digest(),
        ]),
      )
      .sign(signer.keys.privateKey);
    return {
      id: this.credentialId.toString('base64url'),
      rawId: this.credentialId.toString('base64url'),
      type: 'public-key',
      response: {
        clientDataJSON: clientData.toString('base64url'),
        authenticatorData: authData.toString('base64url'),
        signature: signature.toString('base64url'),
        userHandle: Buffer.from(userId).toString('base64url'),
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }

  private rpIdHash(): Buffer {
    return createHash('sha256').update(this.rpID).digest();
  }

  private clientData(type: string, challenge: string, origin?: string): Buffer {
    return Buffer.from(
      JSON.stringify({
        type,
        challenge,
        origin: origin ?? this.origin,
        crossOrigin: false,
      }),
    );
  }
}
