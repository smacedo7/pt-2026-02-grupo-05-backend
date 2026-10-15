import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  UnauthorizedResponse,
  UniqueConflictResponse,
  ValidationErrorResponse,
} from '../api-errors';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiExtraModels(UserResponseDto)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({
    summary: 'Register an account',
    description: 'Public. Does not log the user in.',
  })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiConflictResponse(UniqueConflictResponse)
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  // The /me routes act only on the authenticated user: no id is ever accepted.
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read my profile' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  findMe(@CurrentUserId() userId: number): Promise<UserResponseDto> {
    return this.usersService.findProfile(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Edit my profile',
    description:
      'Send only the fields to change. An empty body returns the current profile. The password cannot be changed here.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiConflictResponse(UniqueConflictResponse)
  updateMe(
    @CurrentUserId() userId: number,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change my password',
    description:
      'Needs the current password. Tokens issued before the change stay valid until they expire.',
  })
  @ApiNoContentResponse({ description: 'Password changed.' })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  async changeMyPassword(
    @CurrentUserId() userId: number,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.usersService.changePassword(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete my account',
    description:
      'Permanent. Also removes the stores of the account, with their products and ratings, and the reviews and comments the account wrote. Tokens of a deleted account answer 401 afterwards.',
  })
  @ApiNoContentResponse({ description: 'Account deleted.' })
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  removeMe(@CurrentUserId() userId: number): Promise<void> {
    return this.usersService.remove(userId);
  }
}
