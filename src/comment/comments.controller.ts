import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse,
  ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UnauthorizedResponse, ValidationErrorResponse } from '../api-errors';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentResponseDto } from './dto/comment-response.dto';

const COMMENT_NOT_FOUND = {
  description: 'No comment with this id.',
  schema: { example: { statusCode: 404, error: 'Not Found', code: 'COMMENT_NOT_FOUND', message: 'comment not found' } },
};

const NOT_OWNER = {
  description: 'Only the author of the comment can edit or delete it.',
  schema: { example: { statusCode: 403, error: 'Forbidden', code: 'COMMENT_NOT_OWNED', message: 'only the author can edit or delete this comment' } },
};

@ApiTags('comments')
@Controller('comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a comment or reply', description: 'Any authenticated user can comment on a product rating.' })
  @ApiCreatedResponse({ type: CommentResponseDto })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  create(@CurrentUserId() userId: number, @Body() dto: CreateCommentDto): Promise<CommentResponseDto> {
    return this.comments.create(userId, dto);
  }

  @Get('rating/:productRatingId')
  @ApiOperation({ summary: 'List comments by product rating', description: 'Public. Returns root comments and their nested replies.' })
  @ApiParam({ name: 'productRatingId', example: 1 })
  @ApiOkResponse({ type: [CommentResponseDto] })
  findAll(@Param('productRatingId', ParseIntPipe) productRatingId: number): Promise<CommentResponseDto[]> {
    return this.comments.findAllByRating(productRatingId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edit a comment', description: 'Only the author can edit the content.' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiOkResponse({ type: CommentResponseDto })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiForbiddenResponse(NOT_OWNER)
  @ApiNotFoundResponse(COMMENT_NOT_FOUND)
  @ApiConflictResponse({ description: 'Concurrent write (WRITE_CONFLICT).' })
  update(
    @CurrentUserId() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCommentDto,
  ): Promise<CommentResponseDto> {
    return this.comments.update(userId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a comment', description: 'Only the author can delete. Replies are deleted with it.' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiNoContentResponse({ description: 'Comment deleted.' })
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiForbiddenResponse(NOT_OWNER)
  @ApiNotFoundResponse(COMMENT_NOT_FOUND)
  async remove(@CurrentUserId() userId: number, @Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.comments.remove(userId, id);
  }
}