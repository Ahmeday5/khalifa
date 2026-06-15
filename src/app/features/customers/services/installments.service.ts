import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/services/api.service';
import { API_ENDPOINTS } from '../../../core/constants/api-endpoints.const';
import {
  withCacheInvalidate,
  withInlineHandling,
} from '../../../core/http/http-context.tokens';
import {
  PayInstallmentPayload,
  PayInstallmentResponse,
} from '../models/client-statement.model';

/**
 * Cache patterns invalidated by a successful installment payment.
 * A payment ripples across many widgets — keep this list explicit so any
 * future page that caches one of these slices auto-refreshes.
 */
const PAYMENT_INVALIDATE_KEYS = [
  'installment',
  'contract',
  'client',
  'payment',
  'treasur',
  'home-summary',
  'financial-separation',
] as const;

@Injectable({ providedIn: 'root' })
export class InstallmentsService {
  private readonly api = inject(ApiService);

  /**
   * POST /installments/pay
   *
   * Records a payment against an open contract. The caller surfaces the
   * server-provided `message` to the user; on success, every cache key
   * listed above is invalidated so dependent widgets (sidebar badges,
   * dashboard summary, contract details modal) refetch automatically.
   */
  pay(payload: PayInstallmentPayload): Observable<PayInstallmentResponse> {
    return this.api.post<PayInstallmentResponse>(
      API_ENDPOINTS.installments.pay,
      payload,
      {
        context: withInlineHandling(
          withCacheInvalidate([...PAYMENT_INVALIDATE_KEYS]),
        ),
      },
    );
  }
}
