export type PaymentStatus =
  | "CREATED"
  | "PENDING"
  | "PROCESSING"
  | "PAID"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED";

export type PaymentMethodType = "ONLINE" | "CASH";

export interface CreatePaymentInput {
  orderId: string;
  restaurantId: string;
  tableId: string;
  currency: string;
  idempotencyKey?: string;
  method?: PaymentMethodType;
}

export interface CreatePaymentResult {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  providerOrderId?: string | null;
  keyId?: string;
  isMockProvider?: boolean;
}

export interface VerifyPaymentInput {
  paymentId: string;
  orderId: string;
  razorpay_order_id?: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  paymentId: string;
  orderId: string;
  orderNumber?: string;
  amount: number;
  status: PaymentStatus;
  error?: string;
}

export interface WebhookResult {
  success: boolean;
  message: string;
  eventId?: string;
  status?: number;
}
