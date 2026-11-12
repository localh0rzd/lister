import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Req,
  Res,
  ForbiddenException,
  UnauthorizedException,
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
import { ChangePasswordDto, LoginDto, SetupDto } from './dto/auth.dto';
import {
  type AuthRequest,
  type AuthResponse,
  SESSION_COOKIE,
  readSessionToken,
  sessionCookieOptions,
} from './http';
import { SetupTokenService } from './setup-token.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly setupToken: SetupTokenService,
    private readonly limits: AttemptLimits,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginDto,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<CurrentUser> {
    this.limits.assertAllowed(request.ip, response);
    let signedIn: SignedIn;
    try {
      signedIn = await this.auth.login(body.username, body.password);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.limits.recordFailure(request.ip);
      }
      throw error;
    }
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
    if (token) {
      const found = this.auth.authenticate(token);
      if (found) this.auth.endSession(found.sessionId);
    }
    response.clearCookie(SESSION_COOKIE, sessionCookieOptions(process.env));
  }

  @AllowMustChangePassword()
  @Get('me')
  me(@SignedInUser() user: CurrentUser): CurrentUser {
    return user;
  }

  @AllowMustChangePassword()
  @Post('password')
  @HttpCode(200)
  async changePassword(
    @Body() body: ChangePasswordDto,
    @SignedInUser() user: CurrentUser,
    @SessionId() sessionId: string,
  ): Promise<CurrentUser> {
    if (body.newPassword === body.currentPassword) {
      throw new BadRequestException(
        'The new password must differ from the current one',
      );
    }
    return this.auth.changePassword(
      user.id,
      sessionId,
      body.currentPassword,
      body.newPassword,
    );
  }

  /** Creates the first account (an admin) with the token from the server log, and signs it in. */
  @Public()
  @Post('setup')
  async setup(
    @Body() body: SetupDto,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<CurrentUser> {
    this.limits.assertAllowed(request.ip, response);
    if (!this.setupToken.isOpen()) {
      throw new NotFoundException('Setup is not available');
    }
    if (!this.setupToken.matches(body.token)) {
      this.limits.recordFailure(request.ip);
      throw new ForbiddenException('The setup token is wrong');
    }
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
