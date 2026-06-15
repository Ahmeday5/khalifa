import {
  ApplicationConfig,
  provideZoneChangeDetection,
} from '@angular/core';
import {
  provideRouter,
  withViewTransitions,
  withComponentInputBinding,
  withRouterConfig,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import {
  provideHttpClient,
  withInterceptors,
  withFetch,
} from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { cacheInterceptor } from './core/interceptors/cache.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { loaderInterceptor } from './core/interceptors/loader.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withViewTransitions(),
      withComponentInputBinding(),
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
      withPreloading(PreloadAllModules)
    ),
    // Interceptor order matters (outermost → innermost → HTTP backend):
    //   cache  → short-circuits hits before any other work runs
    //   loader → toggles the global spinner
    //   error  → normalizes failures into ApiError + toasts
    //   auth   → attaches Bearer + handles 401 refresh dance (must be
    //            innermost so it intercepts 401s BEFORE error can toast them;
    //            successful retries never reach the error layer at all)
    provideHttpClient(
      withFetch(),
      withInterceptors([
        cacheInterceptor,
        loaderInterceptor,
        errorInterceptor,
        authInterceptor,
      ]),
    ),
    provideAnimationsAsync(),
  ],
};
