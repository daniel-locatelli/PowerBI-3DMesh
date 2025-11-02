import { dataViewObjectsParser } from "powerbi-visuals-utils-dataviewutils";
import DataViewObjectsParser = dataViewObjectsParser.DataViewObjectsParser;

export class RenderingSettings {
  public showWireframe: boolean = false;
  public showAxes: boolean = false;
  public autoRotate: boolean = false;
  public rotationSpeed: number = 0.5;
}

export class CameraSettings {
  public viewAngle: string = "NE";
  public distance: number = 5;
}

export class VisualSettings extends DataViewObjectsParser {
  public rendering: RenderingSettings = new RenderingSettings();
  public camera: CameraSettings = new CameraSettings();
}
