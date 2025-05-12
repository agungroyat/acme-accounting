import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Company } from '../../db/models/Company';
import { User, UserRole } from '../../db/models/User';
import {
  Ticket,
  TicketCategory,
  TicketStatus,
  TicketType,
} from '../../db/models/Ticket';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { TicketInterface } from './interfaces/ticket.interface';

@Injectable()
export class TicketsService {
  constructor(
    @InjectModel(Ticket)
    private readonly ticketModel: typeof Ticket,
  ) {}

  async create(createTicketDto: CreateTicketDto): Promise<TicketInterface> {
    const { type, companyId } = createTicketDto;

    const category = this.getTicketCategory(type);

    const userRole =
      type === TicketType.managementReport
        ? UserRole.accountant
        : UserRole.corporateSecretary;

    let assignee: User;

    if (type === TicketType.registrationAddressChange) {
      const registrationAddressChangeTicket = await this.ticketModel.findOne({
        where: {
          companyId,
          type: TicketType.registrationAddressChange,
          status: TicketStatus.open,
        },
        order: [['createdAt', 'DESC']],
      });

      if (registrationAddressChangeTicket) {
        throw new ConflictException(
          `Cannot create a ticket for company ${companyId} because there is already an open ticket for registration address change`,
        );
      }

      const corporateSecretaries = await User.findAll({
        where: { companyId, role: UserRole.corporateSecretary },
      });

      if (corporateSecretaries.length === 0) {
        const directors = await User.findAll({
          where: { companyId, role: UserRole.director },
        });

        if (directors.length > 1) {
          throw new ConflictException(
            `Cannot create a registration address change ticket for company ${companyId} because there are multiple directors`,
          );
        }

        assignee = directors[0];
      } else {
        if (corporateSecretaries.length > 1) {
          throw new ConflictException(
            `Cannot create a registration address change ticket for company ${companyId} because there are multiple corporate secretaries`,
          );
        }

        assignee = corporateSecretaries[0];
      }
    } else if (type === TicketType.strikeOff) {
      const directors = await User.findAll({
        where: { companyId, role: UserRole.director },
      });

      if (directors.length > 1) {
        throw new ConflictException(
          `Cannot create a strike off ticket for company ${companyId} because there are multiple directors`,
        );
      }

      assignee = directors[0];
    } else {
      const assignees = await User.findAll({
        where: { companyId, role: userRole },
        order: [['createdAt', 'DESC']],
      });

      if (!assignees.length)
        throw new ConflictException(
          `Cannot find user with role ${userRole} to create a ticket`,
        );

      if (userRole === UserRole.corporateSecretary && assignees.length > 1)
        throw new ConflictException(
          `Multiple users with role ${userRole}. Cannot create a ticket`,
        );

      assignee = assignees[0];
    }

    const ticket = await this.ticketModel.create({
      companyId,
      assigneeId: assignee.id,
      category,
      type,
      status: TicketStatus.open,
    });

    if (ticket.type === TicketType.strikeOff) {
      await this.ticketModel.update(
        { status: TicketStatus.resolved },
        {
          where: {
            id: { [Op.ne]: ticket.id },
          },
        },
      );
    }

    const ticketDto: TicketInterface = {
      id: ticket.id,
      type: ticket.type,
      assigneeId: ticket.assigneeId,
      status: ticket.status,
      category: ticket.category,
      companyId: ticket.companyId,
    };

    return ticketDto;
  }

  async findAll(): Promise<Ticket[]> {
    return this.ticketModel.findAll({ include: [Company, User] });
  }

  getTicketCategory(type: TicketType): TicketCategory {
    const categories = {
      [TicketType.managementReport]: TicketCategory.accounting,
      [TicketType.registrationAddressChange]: TicketCategory.corporate,
      [TicketType.strikeOff]: TicketCategory.management,
    };

    if (!categories[type]) {
      throw new BadRequestException(
        `Ticket type ${type} is not valid. Valid types are: ${Object.keys(
          categories,
        ).join(', ')}`,
      );
    }

    return categories[type];
  }
}
