import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { ApiService } from '../../../core/services/api.service';
import { API_ENDPOINTS } from '../../../core/constants/api-endpoints.const';
import {
  withCache,
  withCacheBypass,
  withCacheInvalidate,
  withInlineHandling,
} from '../../../core/http/http-context.tokens';
import { ContractDetails } from '../../customers/models/client-statement.model';
import {
  Contract,
  ContractFormState,
  CreatedContract,
  CreateContractPayload,
  buildCreateContractPayload,
  CreateDirectContractPayload,
  CreatedDirectContract,
  UpdateContractFormState,
  buildUpdateContractPayload,
} from '../models/contract.model';

const CONTRACTS_CACHE_KEY = 'contracts';
const CONTRACT_DETAILS_TTL_MS = 60 * 1000;

@Injectable({ providedIn: 'root' })
export class ContractsService {
  private readonly api = inject(ApiService);

  // ─────────── live API ───────────

  /**
   * Direct installment-contract creation.
   *
   * Accepts either the form-state object (preferred — `representativeId`
   * is stripped automatically when not selected) or a fully-formed
   * payload built by the caller.
   *
   * The backend can reject with `400 Insufficient inventory quantity.`
   * when the requested product isn't fully in stock at the chosen
   * warehouse — surface that message verbatim to the user.
   */
  create(
    formOrPayload: ContractFormState | CreateContractPayload,
  ): Observable<CreatedContract> {
    const body = this.isFormState(formOrPayload)
      ? buildCreateContractPayload(formOrPayload)
      : formOrPayload;

    return this.api.post<CreatedContract>(API_ENDPOINTS.contracts.base, body, {
      context: withInlineHandling(
        withCacheInvalidate([
          CONTRACTS_CACHE_KEY,
          'client', // contracts affect client receivables
          'warehous', // stock is decremented at the warehouse
          'treasur', // down payment moves into the treasury
          'invoice', // related invoice aggregates change
          'financial-separation',
        ]),
      ),
    });
  }

  /**
   * Direct installment-contract creation (no product/warehouse link).
   *
   * POST /dashboard/contracts/direct
   */
  createDirect(
    payload: CreateDirectContractPayload,
  ): Observable<CreatedDirectContract> {
    return this.api.post<CreatedDirectContract>(
      API_ENDPOINTS.contracts.direct,
      payload,
      {
        context: withInlineHandling(
          withCacheInvalidate([
            CONTRACTS_CACHE_KEY,
            'client',
            'treasur',
            'financial-separation',
          ]),
        ),
      },
    );
  }

  /**
   * Update an existing direct contract (no product/warehouse link).
   *
   * PUT /dashboard/contracts/direct/{id}
   */
  updateDirect(
    id: number,
    payload: CreateDirectContractPayload,
  ): Observable<CreatedDirectContract> {
    return this.api.put<CreatedDirectContract>(
      API_ENDPOINTS.contracts.directById(id),
      payload,
      {
        context: withInlineHandling(
          withCacheInvalidate([
            CONTRACTS_CACHE_KEY,
            'client',
            'treasur',
            'financial-separation',
          ]),
        ),
      },
    );
  }

  /**
   * Update an existing installment contract.
   *
   * PUT /dashboard/contracts/{id}
   */
  update(
    id: number,
    form: UpdateContractFormState,
  ): Observable<CreatedContract> {
    return this.api.put<CreatedContract>(
      API_ENDPOINTS.contracts.byId(id),
      buildUpdateContractPayload(form),
      {
        context: withInlineHandling(
          withCacheInvalidate([
            CONTRACTS_CACHE_KEY,
            'client',
            'warehous',
            'treasur',
            'financial-separation',
          ]),
        ),
      },
    );
  }

  /**
   * Type-guard for `create()`. `ContractFormState` carries a nullable
   * `representativeId`; `CreateContractPayload` only has it when it's
   * actually being sent.
   */
  private isFormState(
    value: ContractFormState | CreateContractPayload,
  ): value is ContractFormState {
    // ContractFormState always includes representativeId (even if null),
    // and it doesn't have the 'status' or other fields of CreatedContract
    // (though CreateContractPayload also doesn't have them).
    // The key difference is that ContractFormState is intended to be processed
    // by buildCreateContractPayload.
    return 'representativeId' in value;
  }

  /**
   * Full contract details — client, product, warehouse, summary, and the
   * full installments schedule.
   *
   *   GET /dashboard/contracts/{id}/details
   *
   * Cached briefly; invalidated by any `payment` / `installment` / `contract`
   * mutation so the modal reflects the latest paid amounts.
   */
  getDetails(id: number): Observable<ContractDetails> {
    return this.api.get<ContractDetails>(API_ENDPOINTS.contracts.details(id), {
      context: withCache({ ttlMs: CONTRACT_DETAILS_TTL_MS }),
    });
  }

  refreshDetails(id: number): Observable<ContractDetails> {
    return this.api.get<ContractDetails>(API_ENDPOINTS.contracts.details(id), {
      context: withCacheBypass(withCache({ ttlMs: CONTRACT_DETAILS_TTL_MS })),
    });
  }

  /**
   * POST /dashboard/contracts/{id}/return
   *
   * Returns / cancels a contract. The backend rejects this when any
   * installment payment has already been recorded — surface the
   * `message` from the 400 response verbatim.
   */
  returnContract(id: number): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(
      API_ENDPOINTS.contracts.return(id),
      {},
      {
        context: withInlineHandling(
          withCacheInvalidate([
            CONTRACTS_CACHE_KEY,
            'client',
            'warehous',
            'treasur',
            'financial-separation',
          ]),
        ),
      },
    );
  }
}
