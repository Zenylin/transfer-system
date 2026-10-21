import { Component } from '@angular/core';

@Component({
  selector: 'app-upload-zone',
  templateUrl: './upload-zone.component.html'
})
export class UploadZoneComponent {
  onFileSelected(event: any) {
    console.log("檔案已選取:", event.target.files[0]);
    alert("上傳功能開發中！");
  }
}