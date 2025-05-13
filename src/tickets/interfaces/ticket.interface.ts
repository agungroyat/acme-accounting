import { TicketCategory, TicketStatus, TicketType } from '../ticket.model';

export interface TicketInterface {
  id: number;
  type: TicketType;
  companyId: number;
  assigneeId: number;
  status: TicketStatus;
  category: TicketCategory;
}
