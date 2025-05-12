import { Body, ConflictException, Controller, Get, Post } from '@nestjs/common';
import { Op } from 'sequelize';
import { Company } from '../../db/models/Company';
import {
  Ticket,
  TicketCategory,
  TicketStatus,
  TicketType,
} from '../../db/models/Ticket';
import { User, UserRole } from '../../db/models/User';

interface newTicketDto {
  type: TicketType;
  companyId: number;
}

interface TicketDto {
  id: number;
  type: TicketType;
  companyId: number;
  assigneeId: number;
  status: TicketStatus;
  category: TicketCategory;
}

@Controller('api/v1/tickets')
export class TicketsController {
  @Get()
  async findAll() {
    return await Ticket.findAll({ include: [Company, User] });
  }

  @Post()
  async create(@Body() newTicketDto: newTicketDto) {
    const { type, companyId } = newTicketDto;

    const category = this.getTicketCategory(type);

    const userRole =
      type === TicketType.managementReport
        ? UserRole.accountant
        : UserRole.corporateSecretary;

    let assignee: User;

    if (type === TicketType.registrationAddressChange) {
      const registrationAddressChangeTicket = await Ticket.findOne({
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

    const ticket = await Ticket.create({
      companyId,
      assigneeId: assignee.id,
      category,
      type,
      status: TicketStatus.open,
    });

    if (ticket.type === TicketType.strikeOff) {
      await Ticket.update(
        { status: TicketStatus.resolved },
        {
          where: {
            id: { [Op.ne]: ticket.id },
          },
        },
      );
    }

    const ticketDto: TicketDto = {
      id: ticket.id,
      type: ticket.type,
      assigneeId: ticket.assigneeId,
      status: ticket.status,
      category: ticket.category,
      companyId: ticket.companyId,
    };

    return ticketDto;
  }

  getTicketCategory(type: TicketType): TicketCategory {
    switch (type) {
      case TicketType.managementReport:
        return TicketCategory.accounting;
      case TicketType.registrationAddressChange:
        return TicketCategory.corporate;
      case TicketType.strikeOff:
        return TicketCategory.management;
      default:
        throw new Error('Invalid ticket type');
    }
  }
}
