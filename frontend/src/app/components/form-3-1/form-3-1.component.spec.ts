import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Form31Component } from './form-3-1.component';

describe('Form31Component', () => {
  let component: Form31Component;
  let fixture: ComponentFixture<Form31Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Form31Component]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Form31Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
