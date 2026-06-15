import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TreasuryFormModelComponent } from './treasury-form-model.component';

describe('TreasuryFormModelComponent', () => {
  let component: TreasuryFormModelComponent;
  let fixture: ComponentFixture<TreasuryFormModelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TreasuryFormModelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TreasuryFormModelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
