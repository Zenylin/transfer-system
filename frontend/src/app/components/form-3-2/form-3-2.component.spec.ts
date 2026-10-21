import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Form32Component } from './form-3-2.component';

describe('Form32Component', () => {
  let component: Form32Component;
  let fixture: ComponentFixture<Form32Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Form32Component]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Form32Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
