import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Patch,
  Post,
  Req,
  Res,
  ForbiddenException,
} from '@nestjs/common';
import type { CurrentUser } from '@lister/shared/api-contracts';
import { AttemptLimits } from './attempt-limits.service';
import {
  AuthService,
  SESSION_LIFETIME_MS,
  type SignedIn,
} from './auth.service';
import {
  AllowMustChangePassword,
  Public,
  SessionId,
  SignedInUser,
} from './decorators';
import {
  ChangePasswordDto,
  LoginDto,
  SetupDto,
  UpdateProfileDto,
} from './dto/auth.dto';
import { PasskeyLoginDto } from './dto/passkeys.dto';
import {
  type AuthRequest,
  type AuthResponse,
  SESSION_COOKIE,
  readSessionToken,
  sessionCookieOptions,
} from './http';
import { PasskeysService } from './passkeys.service';
import { clientKey } from './rate-limiter';
import { SetupTokenService } from './setup-token.service';
import { UsersService } from './users.service';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly setupToken: SetupTokenService,
    private readonly limits: AttemptLimits,
    private readonly users: UsersService,
    private readonly passkeys: PasskeysService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginDto,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<CurrentUser> {
    // Counted as a failure until it succeeds, so parallel guesses can't outrun the limit.
    const attempt = this.limits.begin(request.ip, response);
    const signedIn = await this.auth.login(body.username, body.password);
    attempt.release();
    this.setCookie(response, signedIn);
    return signedIn.user;
  }

  /** Options for signing in with a passkey; no username, the authenticator offers its passkeys. */
  @Public()
  @Post('passkey/options')
  @HttpCode(200)
  passkeyOptions(@Req() request: AuthRequest) {
    return this.passkeys.authenticationOptions(clientKey(request.ip));
  }

  /** Signs in with a passkey: the same session and cookie as `login`. */
  @Public()
  @Post('passkey/login')
  @HttpCode(200)
  async passkeyLogin(
    @Body() body: PasskeyLoginDto,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<CurrentUser> {
    const attempt = this.limits.begin(request.ip, response);
    const signedIn = await this.passkeys.signIn(body.response);
    attempt.release();
    this.setCookie(response, signedIn);
    return signedIn.user;
  }

  /** Public so that an expired session can still clear its cookie. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): void {
    const token = readSessionToken(request.headers['cookie']);
    if (!token) {
      this.logger.debug('Sign-out without a session cookie');
    } else {
      const found = this.auth.authenticate(token);
      if (found) this.auth.endSession(found.sessionId);
      else this.logger.debug('Sign-out: unknown or expired session');
    }
    response.clearCookie(SESSION_COOKIE, sessionCookieOptions(process.env));
  }

  @AllowMustChangePassword()
  @Get('me')
  me(@SignedInUser() user: CurrentUser): CurrentUser {
    return user;
  }

  /** Users edit their own display name; the username and admin flag stay with the admins. */
  @Patch('me')
  updateProfile(
    @Body() body: UpdateProfileDto,
    @SignedInUser() user: CurrentUser,
  ): CurrentUser {
    return this.users.update(user.id, { displayName: body.displayName });
  }

  @AllowMustChangePassword()
  @Post('password')
  @HttpCode(200)
  async changePassword(
    @Body() body: ChangePasswordDto,
    @SignedInUser() user: CurrentUser,
    @SessionId() sessionId: string,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<CurrentUser> {
    if (body.newPassword === body.currentPassword) {
      throw new BadRequestException(
        'The new password must differ from the current one',
      );
    }
    // Guessing the current password is limited like guessing at sign-in.
    const attempt = this.limits.begin(request.ip, response);
    const changed = await this.auth.changePassword(
      user.id,
      sessionId,
      body.currentPassword,
      body.newPassword,
    );
    attempt.release();
    return changed;
  }

  /** Creates the first account (an admin) with the token from the server log, and signs it in. */
  @Public()
  @Post('setup')
  async setup(
    @Body() body: SetupDto,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<CurrentUser> {
    const attempt = this.limits.begin(request.ip, response);
    if (!this.setupToken.isOpen()) {
      attempt.release();
      throw new NotFoundException('Setup is not available');
    }
    if (!this.setupToken.matches(body.token)) {
      throw new ForbiddenException('The setup token is wrong');
    }
    attempt.release();
    const user = await this.auth.createFirstAdmin({
      username: body.username,
      displayName: body.displayName,
      password: body.password,
    });
    this.setupToken.consume();
    const row = this.auth.findByUsername(user.username);
    if (!row) throw new Error('The first admin was just created');
    const signedIn = this.auth.startSession(row);
    this.setCookie(response, signedIn);
    return signedIn.user;
  }

  private setCookie(response: AuthResponse, signedIn: SignedIn): void {
    response.cookie(
      SESSION_COOKIE,
      signedIn.token,
      sessionCookieOptions(process.env, SESSION_LIFETIME_MS),
    );
  }
}
