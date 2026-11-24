import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StoreRatingsController } from './store-ratings.controller';
import { StoreRatingsService } from './store-ratings.service';

@Module({
  imports: [AuthModule],
  controllers: [StoreRatingsController],
  providers: [StoreRatingsService],
})
export class StoreRatingsModule {}
