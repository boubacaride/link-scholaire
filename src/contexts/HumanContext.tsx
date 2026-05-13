"use client";

import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from "react";
import { HumanApiWrapper } from "@/lib/biodigital/humanApi";
import { CameraService, SceneService, LabelsService, TimelineService, HumanService, InputService, UIService, QuizService } from "@/lib/biodigital/services";

interface HumanServices {
  camera: CameraService;
  scene: SceneService;
  labels: LabelsService;
  timeline: TimelineService;
  human: HumanService;
  input: InputService;
  ui: UIService;
  quiz: QuizService;
}

interface HumanContextType {
  api: HumanApiWrapper;
  services: HumanServices | null;
  ready: boolean;
  currentModel: string | null;
  initViewer: (iframeId: string) => Promise<void>;
  loadModel: (modelId: string) => void;
}

const apiInstance = new HumanApiWrapper();

const HumanContext = createContext<HumanContextType>({
  api: apiInstance,
  services: null,
  ready: false,
  currentModel: null,
  initViewer: async () => {},
  loadModel: () => {},
});

export function HumanProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [services, setServices] = useState<HumanServices | null>(null);
  const apiRef = useRef(apiInstance);

  const initViewer = useCallback(async (iframeId: string) => {
    try {
      await apiRef.current.init(iframeId);

      const svc: HumanServices = {
        camera: new CameraService(apiRef.current),
        scene: new SceneService(apiRef.current),
        labels: new LabelsService(apiRef.current),
        timeline: new TimelineService(apiRef.current),
        human: new HumanService(apiRef.current),
        input: new InputService(apiRef.current),
        ui: new UIService(apiRef.current),
        quiz: new QuizService(apiRef.current),
      };

      setServices(svc);
      setReady(true);
    } catch (err) {
      console.error("Failed to init BioDigital viewer:", err);
    }
  }, []);

  const loadModel = useCallback((modelId: string) => {
    setCurrentModel(modelId);
  }, []);

  return (
    <HumanContext.Provider value={{ api: apiRef.current, services, ready, currentModel, initViewer, loadModel }}>
      {children}
    </HumanContext.Provider>
  );
}

export const useHuman = () => useContext(HumanContext);
