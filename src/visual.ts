import * as THREE from "three";
import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import DataView = powerbi.DataView;
import DataViewTable = powerbi.DataViewTable;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
import { VisualSettings } from "./settings";

interface MeshFrame {
  vertices: number[][]; // Each vertex: [x, y, z, r, g, b]
  faces: number[][]; // Each face: [v1, v2, v3]
}

export class Visual implements IVisual {
  private target: HTMLElement;
  private host: IVisualHost;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private mesh: THREE.Mesh;
  private meshGroup: THREE.Group;
  private animationFrameId: number;
  private axesHelper: THREE.AxesHelper;
  private gridHelper: THREE.GridHelper;
  private settings: VisualSettings;

  constructor(options: VisualConstructorOptions) {
    console.log("Visual constructor");
    this.target = options.element;
    this.host = options.host;
    this.settings = new VisualSettings();
    this.initThreeJS();
    this.animate();
  }

  private initThreeJS(): void {
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf5f5f5);

    // Create camera
    const width = this.target.clientWidth || 800;
    const height = this.target.clientHeight || 600;
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);

    // Set initial isometric camera position
    this.updateCameraPosition();

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.target.appendChild(this.renderer.domElement);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(5, 10, 7.5);
    this.scene.add(directionalLight);

    // Create a group to hold the mesh (for centered rotation)
    this.meshGroup = new THREE.Group();
    this.scene.add(this.meshGroup);

    // Add helpers
    this.axesHelper = new THREE.AxesHelper(2);
    this.scene.add(this.axesHelper);

    this.gridHelper = new THREE.GridHelper(10, 10, 0x888888, 0xcccccc);
    // this.scene.add(this.gridHelper);
  }

  private updateCameraPosition(): void {
    const distance = this.settings.camera.distance;
    const viewAngle = this.settings.camera.viewAngle;

    // Isometric angle is approximately 35.264 degrees from horizontal
    // For a true isometric view from top-down perspective
    const isometricAngle = Math.atan(1 / Math.sqrt(2)); // ~35.264 degrees
    const heightFactor = Math.sin(isometricAngle);
    const horizontalFactor = Math.cos(isometricAngle);

    let x = 0,
      z = 0;

    switch (viewAngle) {
      case "NE": // North-East (positive X, positive Z)
        x = distance * horizontalFactor;
        z = distance * horizontalFactor;
        break;
      case "NW": // North-West (negative X, positive Z)
        x = -distance * horizontalFactor;
        z = distance * horizontalFactor;
        break;
      case "SW": // South-West (negative X, negative Z)
        x = -distance * horizontalFactor;
        z = -distance * horizontalFactor;
        break;
      case "SE": // South-East (positive X, negative Z)
        x = distance * horizontalFactor;
        z = -distance * horizontalFactor;
        break;
    }

    const y = distance * heightFactor;

    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  private animate = (): void => {
    this.animationFrameId = requestAnimationFrame(this.animate);

    // Apply rotation if enabled
    if (this.settings.rendering.autoRotate && this.meshGroup) {
      this.meshGroup.rotation.y += 0.01 * this.settings.rendering.rotationSpeed;
    }

    this.renderer.render(this.scene, this.camera);
  };

  public update(options: VisualUpdateOptions): void {
    console.log("Visual update", options);

    // Parse settings
    this.settings = VisualSettings.parse<VisualSettings>(options.dataViews[0]);

    // Update camera position based on settings
    this.updateCameraPosition();

    // Update helpers visibility
    this.axesHelper.visible = this.settings.rendering.showAxes;

    const dataView: DataView = options.dataViews[0];
    if (!dataView || !dataView.table) {
      console.log("No data available");
      return;
    }

    try {
      // Get the current frame data from Power BI
      const frameData = this.parseFrameData(dataView.table);

      if (!frameData) {
        console.log("No valid frame data");
        return;
      }

      console.log(
        `Rendering frame with ${frameData.vertices.length} vertices and ${frameData.faces.length} faces`
      );

      // Remove old mesh if exists
      if (this.mesh) {
        this.meshGroup.remove(this.mesh);
        this.mesh.geometry.dispose();
        if (Array.isArray(this.mesh.material)) {
          this.mesh.material.forEach((m) => m.dispose());
        } else {
          this.mesh.material.dispose();
        }
      }

      // Create new mesh from frame data
      this.mesh = this.createMeshFromFrame(frameData);

      // Center the mesh at origin before adding to group
      this.centerMesh();

      // Add to group (which will rotate around its center)
      this.meshGroup.add(this.mesh);

      // Scale the entire group
      this.scaleGroup();

      // Handle resize
      if (options.type === 4) {
        // ResizeEnd
        this.handleResize();
      }
    } catch (error) {
      console.error("Error updating visual:", error);
    }
  }

  // Required for Format pane to show custom properties
  public enumerateObjectInstances(
    options: EnumerateVisualObjectInstancesOptions
  ): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {
    return VisualSettings.enumerateObjectInstances(
      this.settings || new VisualSettings(),
      options
    );
  }

  private parseFrameData(table: DataViewTable): MeshFrame | null {
    const columns = table.columns;

    // Find column indices
    const timeIdx = columns.findIndex((c) => c.roles && c.roles["time"]);
    const meshDataIdx = columns.findIndex(
      (c) => c.roles && c.roles["meshData"]
    );

    console.log("Column indices:", { timeIdx, meshDataIdx });

    if (meshDataIdx === -1 || table.rows.length === 0) {
      console.log("Missing meshData column or no rows");
      return null;
    }

    // Get the first row (Power BI filtering will ensure only current time is passed)
    const row = table.rows[0];
    const meshDataString = row[meshDataIdx] as string;

    if (!meshDataString) {
      console.log("Empty mesh data");
      return null;
    }

    try {
      const frameData: MeshFrame = JSON.parse(meshDataString);
      console.log("Parsed frame data:", frameData);
      return frameData;
    } catch (e) {
      console.error("Failed to parse JSON:", e);
      console.log("Raw data:", meshDataString);
      return null;
    }
  }

  private createMeshFromFrame(frameData: MeshFrame): THREE.Mesh {
    const geometry = new THREE.BufferGeometry();

    const vertexCount = frameData.vertices.length;
    const faceCount = frameData.faces.length;

    // Create position and color arrays
    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);

    frameData.vertices.forEach((vertex, i) => {
      // Vertex format: [x, y, z, r, g, b]
      positions[i * 3] = vertex[0]; // X
      positions[i * 3 + 1] = vertex[1]; // Y
      positions[i * 3 + 2] = vertex[2]; // Z

      colors[i * 3] = vertex[3]; // R
      colors[i * 3 + 1] = vertex[4]; // G
      colors[i * 3 + 2] = vertex[5]; // B
    });

    // Create index array for faces
    const indices = new Uint32Array(faceCount * 3);
    frameData.faces.forEach((face, i) => {
      // Face format: [v1, v2, v3]
      indices[i * 3] = face[0];
      indices[i * 3 + 1] = face[1];
      indices[i * 3 + 2] = face[2];
    });

    // Set geometry attributes
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    // Compute normals for proper lighting
    geometry.computeVertexNormals();

    // Create material
    const material = new THREE.MeshPhongMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      flatShading: false,
      shininess: 30,
      wireframe: this.settings.rendering.showWireframe,
    });

    return new THREE.Mesh(geometry, material);
  }

  private centerMesh(): void {
    if (!this.mesh) return;

    // Center the mesh at the origin
    const box = new THREE.Box3().setFromObject(this.mesh);
    const center = box.getCenter(new THREE.Vector3());
    this.mesh.position.sub(center);
  }

  private scaleGroup(): void {
    if (!this.meshGroup) return;

    // Calculate bounding box of the entire group
    const box = new THREE.Box3().setFromObject(this.meshGroup);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    if (maxDim > 0) {
      const scale = 2 / maxDim; // Scale to fit in a 2-unit space
      this.meshGroup.scale.set(scale, scale, scale);
    }
  }

  private handleResize(): void {
    const width = this.target.clientWidth;
    const height = this.target.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public destroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}
