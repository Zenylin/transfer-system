import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UploadZoneComponent } from './upload-zone.component';

describe('UploadZoneComponent', () => {
  let component: UploadZoneComponent;
  let fixture: ComponentFixture<UploadZoneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UploadZoneComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UploadZoneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
