import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { SequelizeModuleOptions } from '@nestjs/sequelize/dist/interfaces/sequelize-options.interface';
import { Company } from '../db/models/Company';
import { User } from '../db/models/User';
import dbConfig from '../db/config/config.json';
import { Ticket } from './tickets/ticket.model';

const devConfig = dbConfig.development as SequelizeModuleOptions;
const testConfig = dbConfig.test as SequelizeModuleOptions;

const config = process.env.NODE_ENV === 'test' ? testConfig : devConfig;

@Module({
  imports: [
    SequelizeModule.forRoot({
      ...config,
      autoLoadModels: true,
      synchronize: true,
      models: [Company, User, Ticket],
    }),
  ],
})
export class DbModule {}
