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
} from './ticket.model';
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
    const assignee = await this.getAssigneeForTicket(type, companyId);

    const ticket = await this.ticketModel.create({
      companyId,
      assigneeId: assignee.id,
      category,
      type,
      status: TicketStatus.open,
    });

    if (ticket.type === TicketType.strikeOff) {
      await this.resolveOtherTickets(ticket.id);
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

  private getTicketCategory(type: TicketType): TicketCategory {
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

  private async getAssigneeForTicket(
    type: TicketType,
    companyId: number,
  ): Promise<User> {
    if (type === TicketType.managementReport) {
      return this.getAccountantAssignee(companyId);
    }

    if (type === TicketType.registrationAddressChange) {
      await this.validateExistingTickets(
        TicketType.registrationAddressChange,
        companyId,
      );
      return this.getCorporateSecretaryAssignee(companyId);
    }

    return this.getDirectorAssignee(type, companyId);
  }

  private async validateExistingTickets(
    type: TicketType,
    companyId: number,
  ): Promise<void> {
    const existingTickets = await this.ticketModel.findAll({
      where: {
        companyId,
        type,
        status: TicketStatus.open,
      },
    });

    if (existingTickets.length > 0) {
      throw new ConflictException(
        `Cannot create a ticket for company ${companyId} because there is already an open ticket of type ${type}`,
      );
    }
  }

  private async getCorporateSecretaryAssignee(
    companyId: number,
  ): Promise<User> {
    const corporateSecretaries = await User.findAll({
      where: { companyId, role: UserRole.corporateSecretary },
    });

    const hasNoCorporateSecretaries = corporateSecretaries.length === 0;
    const hasMultipleCorporateSecretaries = corporateSecretaries.length > 1;

    if (hasNoCorporateSecretaries) {
      return this.getDirectorAssignee(
        TicketType.registrationAddressChange,
        companyId,
      );
    }

    if (hasMultipleCorporateSecretaries) {
      throw new BadRequestException(
        `Cannot create a registration address change ticket for company ${companyId} because there are multiple corporate secretaries`,
      );
    }

    return corporateSecretaries[0];
  }

  private async getDirectorAssignee(
    type: TicketType,
    companyId: number,
  ): Promise<User> {
    const directors = await User.findAll({
      where: { companyId, role: UserRole.director },
    });

    const ticketTypeLabel = this.getTicketTypeLabel(type);

    if (directors.length > 1) {
      throw new BadRequestException(
        `Cannot create a ${ticketTypeLabel} ticket for company ${companyId} because there are multiple directors`,
      );
    }

    if (directors.length === 0) {
      throw new BadRequestException(
        `Cannot create a ${ticketTypeLabel} ticket for company ${companyId} because there are no directors`,
      );
    }

    return directors[0];
  }

  private getTicketTypeLabel(type: TicketType): string {
    const labels = {
      [TicketType.managementReport]: 'management report',
      [TicketType.registrationAddressChange]: 'registration address change',
      [TicketType.strikeOff]: 'strike off',
    };

    if (!labels[type]) {
      throw new BadRequestException(
        `Ticket type ${type} is not valid. Valid types are: ${Object.keys(
          labels,
        ).join(', ')}`,
      );
    }

    return labels[type];
  }

  private async getAccountantAssignee(companyId: number): Promise<User> {
    const accountants = await User.findAll({
      where: { companyId, role: UserRole.accountant },
      order: [['createdAt', 'DESC']],
    });

    const hasNoAccountants = accountants.length === 0;

    if (hasNoAccountants) {
      throw new BadRequestException(
        `Cannot create a management report ticket for company ${companyId} because there are no accountants`,
      );
    }

    return accountants[0];
  }

  private async resolveOtherTickets(ticketId: number): Promise<void> {
    await this.ticketModel.update(
      { status: TicketStatus.resolved },
      {
        where: {
          id: { [Op.ne]: ticketId },
        },
      },
    );
  }
}
