import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ValidationErrorResponse } from '../api-errors';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordResetService } from './password-reset.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  // Same answer whether or not the e-mail is registered.
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Ask for a password reset code',
    description:
      'Always answers 202 with the same body, whether or not the e-mail is registered, and never includes the code. Delivery goes through a channel that is still a pending infrastructure decision: no e-mail is sent by this API yet. Development prints the code in the server console.',
  })
  @ApiAcceptedResponse({
    description: 'Same answer for registered and unknown e-mails.',
    schema: { example: { message: 'Request received.' } },
  })
  @ApiBadRequestResponse(ValidationErrorResponse)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    await this.passwordResetService.requestCode(dto.email);
    return { message: 'Request received.' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Set a new password with a reset code',
    description:
      'The code is valid for 15 minutes, works once, and is burned after 5 wrong attempts.',
  })
  @ApiNoContentResponse({ description: 'Password changed.' })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiBadRequestResponse({
    description: 'Invalid, expired or already used code.',
    schema: {
      example: {
        statusCode: 400,
        error: 'Bad Request',
        code: 'RESET_CODE_INVALID',
        message: 'the code is invalid, expired or already used',
      },
    },
  })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.passwordResetService.resetPassword(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in with email and password',
    description: 'The email is compared case-insensitively.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiUnauthorizedResponse({
    description:
      'Wrong password or unknown email; the answer is the same for both.',
    schema: {
      example: {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid credentials',
      },
    },
  })
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }
}
