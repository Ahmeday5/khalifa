import {
  Directive,
  TemplateRef,
  ViewContainerRef,
  effect,
  inject,
  input,
} from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { Permission } from '../../core/constants/permissions.const';

type PermissionInput = Permission | string | ReadonlyArray<Permission | string>;

/**
 * Renders its host element only when the current user holds the specified
 * permission(s). Array input means "ALL of" — use {@link HasAnyPermissionDirective}
 * for "ANY of" semantics.
 *
 *   <button *appHasPermission="'Treasury.FullAccess'">تحويل</button>
 *   <a *appHasPermission="['Clients.View', 'Suppliers.View']">…</a>
 *
 * Falsy / empty inputs render the element unconditionally — useful when
 * the required permission comes from data (`null` means "no gate").
 */
@Directive({
  selector: '[appHasPermission]',
  standalone: true,
})
export class HasPermissionDirective {
  readonly appHasPermission = input.required<PermissionInput | null | undefined>();

  private readonly auth = inject(AuthService);
  private readonly tpl = inject(TemplateRef);
  private readonly vcr = inject(ViewContainerRef);

  constructor() {
    effect(() => {
      const required = this.appHasPermission();
      const granted =
        required == null ||
        (Array.isArray(required) && required.length === 0)
          ? true
          : this.auth.hasPermission(required as string | readonly string[]);

      this.vcr.clear();
      if (granted) this.vcr.createEmbeddedView(this.tpl);
    });
  }
}

/**
 * Renders its host element when the current user holds AT LEAST ONE of the
 * specified permissions.
 *
 *   <a *appHasAnyPermission="['Treasury.View', 'Treasury.FullAccess']">الخزينة</a>
 */
@Directive({
  selector: '[appHasAnyPermission]',
  standalone: true,
})
export class HasAnyPermissionDirective {
  readonly appHasAnyPermission = input.required<
    ReadonlyArray<Permission | string> | null | undefined
  >();

  private readonly auth = inject(AuthService);
  private readonly tpl = inject(TemplateRef);
  private readonly vcr = inject(ViewContainerRef);

  constructor() {
    effect(() => {
      const required = this.appHasAnyPermission();
      const granted =
        !required || required.length === 0
          ? true
          : this.auth.hasAnyPermission(required as readonly string[]);

      this.vcr.clear();
      if (granted) this.vcr.createEmbeddedView(this.tpl);
    });
  }
}
