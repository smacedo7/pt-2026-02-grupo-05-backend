import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // Confira se o caminho para o seu PrismaService é esse mesmo!
import { CreateProductRatingDto } from './dto/create-product-rating.dto';
import { UpdateProductRatingDto } from './dto/update-product-rating.dto';

@Injectable()
export class RatingsService {
  constructor(private prisma: PrismaService) {}

  async createProductRating(userId: number, productId: number, dto: CreateProductRatingDto) {
    // verifica se o produto existe
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Produto não encontrado.');

    // verifica regra do banco de dados
    const existingRating = await this.prisma.productRating.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    if (existingRating) throw new ConflictException('Você já avaliou este produto.');

    // cria a avaliação
    return this.prisma.productRating.create({
      data: { ...dto, userId, productId },
    });
  }

  async findAllProductRatings(productId: number) {
    // nas avaliações busca o nome e a foto de quem avaliou
    return this.prisma.productRating.findMany({
      where: { productId },
      include: {
        user: { select: { id: true, name: true, username: true, profilePictureUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneRating(id: number) {
    const rating = await this.prisma.productRating.findUnique({ where: { id } });
    if (!rating) throw new NotFoundException('Avaliação não encontrada.');
    return rating;
  }

  async updateProductRating(userId: number, id: number, dto: UpdateProductRatingDto) {
    const rating = await this.findOneRating(id);
    
    // só o dono da avaliação pode editar
    if (rating.userId !== userId) throw new ForbiddenException('Sem permissão para editar.');

    return this.prisma.productRating.update({
      where: { id },
      data: dto,
    });
  }

  async removeProductRating(userId: number, id: number) {
    const rating = await this.findOneRating(id);
    
    // Só deixa apagar se for o dono da avaliação
    if (rating.userId !== userId) throw new ForbiddenException('Sem permissão para deletar.');

    await this.prisma.productRating.delete({ where: { id } });
    return { message: 'Avaliação deletada com sucesso.' };
  }
}