import { TicketType } from '../ticket.model';

export interface CreateTicketDto {
  type: TicketType;
  companyId: number;
}
