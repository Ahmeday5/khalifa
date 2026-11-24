import { Pipe, PipeTransform } from '@angular/core';

import { formatClientNumber } from '../utils/client-number.util';

/** Renders a client's sequential number — usage: `{{ client.id | clientNumber }}`. */
@Pipe({ name: 'clientNumber', standalone: true, pure: true })
export class ClientNumberPipe implements PipeTransform {
  transform(id: number | null | undefined): string {
    return formatClientNumber(id);
  }
}
