import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoaderService } from '../services/loader.service';
import { SKIP_LOADER } from '../http/http-context.tokens';

/**
 * Toggles the global loader for requests that don't opt out via `SKIP_LOADER`.
 * Component-local loaders (button spinners, table skeletons) should pass
 * `withSkipLoader()` so the page-level overlay stays hidden.
 */
export const loaderInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_LOADER)) {
    return next(req);
  }

  const loader = inject(LoaderService);
  loader.show();
  return next(req).pipe(finalize(() => loader.hide()));
};
