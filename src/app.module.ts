import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductImagesModule } from './product-images/product-images.module';
import { ProductsModule } from './products/products.module';
import { StoreRatingsModule } from './store-ratings/store-ratings.module';
import { StoresModule } from './stores/stores.module';
import { UsersModule } from './users/users.module';
import { CommentsModule } from './comment/comments.module'; 

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    CategoriesModule,
    ProductsModule,
    ProductImagesModule,
    StoresModule,
    StoreRatingsModule,
    CommentsModule,
  ],
  providers: [
    {
      // Unknown properties reject the whole request instead of being dropped.
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule {}