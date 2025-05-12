import { TicketType } from '../../../db/models/Ticket';

export interface CreateTicketDto {
  type: TicketType;
  companyId: number;
}
