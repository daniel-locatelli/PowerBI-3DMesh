import { dataViewObjectsParser } from "powerbi-visuals-utils-dataviewutils";
import DataViewObjectsParser = dataViewObjectsParser.DataViewObjectsParser;
export declare class RenderingSettings {
    showWireframe: boolean;
    showAxes: boolean;
    autoRotate: boolean;
    rotationSpeed: number;
}
export declare class CameraSettings {
    viewAngle: string;
    distance: number;
}
export declare class VisualSettings extends DataViewObjectsParser {
    rendering: RenderingSettings;
    camera: CameraSettings;
}
