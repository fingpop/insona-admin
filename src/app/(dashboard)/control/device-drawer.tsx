"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { InSonaDevice, DEVICE_TYPE_LABELS } from "@/lib/types";
import { parseDeviceValue, resolveDeviceFunc } from "./utils";

export default function DeviceDrawer({
  device,
  open,
  onClose,
  onControl,
  roomName,
}: {
  device: InSonaDevice | null;
  open: boolean;
  onClose: () => void;
  onControl: (did: string, action: string, value: number[], meshid: string, transition?: number) => void;
  roomName: string;
}) {
  const { t } = useTranslation();
  const [brightness, setBrightness] = useState(100);
  const [colorTemp, setColorTemp] = useState(50); // 0-100, 0=最暖, 100=最冷

  useEffect(() => {
    if (device && device.value) {
      // value[0] = 开关状态 (0=关, 1=开)
      // value[1] = 亮度 (0-100)
      // value[2] = 色温 (0-100)
      const brightnessVal = device.value[1];
      const colorTempVal = device.value[2];
      if (brightnessVal !== undefined) {
        setBrightness(brightnessVal);
      }
      if (colorTempVal !== undefined) {
        setColorTemp(colorTempVal);
      }
    }
  }, [device]);

  if (!device) return null;

  const isLight = device.type === 1984;
  const resolvedFunc = resolveDeviceFunc(device.func, device.funcs);
  const isDimmable = resolvedFunc === 3 || resolvedFunc === 4 || resolvedFunc === 5; // 可调光
  const hasColorTemp = resolvedFunc === 4; // 双色温
  const hasRGB = resolvedFunc === 5; // HSL灯
  const isOn = device.value?.[0] > 0;

  const handleSwitch = async (on: boolean) => {
    await onControl(device.did, "onoff", [on ? 1 : 0], device.meshid, 1000);
  };

  const handleBrightness = async (value: number) => {
    setBrightness(value);
    await onControl(device.did, "level", [value], device.meshid, 1000);
  };

  const handleColorTemp = async (value: number) => {
    setColorTemp(value);
    // 设备控制页面使用 temperature action
    await onControl(device.did, "temperature", [value], device.meshid, 1000);
  };

  const handleRGB = async (color: string) => {
    // Parse hex color to HSL values
    const r = parseInt(color.slice(1, 3), 16) / 255;
    const g = parseInt(color.slice(3, 5), 16) / 255;
    const b = parseInt(color.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    const brightnessPct = brightness;
    const hue = Math.round(h * 360);
    const saturation = max === 0 ? 0 : Math.round((max - min) / (1 - Math.abs(2 * l - 1)) * 100);

    await onControl(device.did, "hsl", [brightnessPct, hue, saturation], device.meshid, 1000);
  };

  return (
    <>
      {/* 遮罩 */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* 抽屉 */}
      <div
        className={`fixed right-0 top-0 h-full w-[400px] bg-gradient-to-b from-[#1a1f2e] to-[#151a28] shadow-[-4px_0_20px_rgba(0,0,0,0.5)] z-50 transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-6 overflow-y-auto h-full">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">{t("drawer.control")}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <i className="fas fa-times text-xl" />
            </button>
          </div>

          {/* 设备信息卡片 */}
          <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20 mb-6">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-lg font-bold text-white">{device.name || t("devices.unnamed")}</h4>
              <span className={`badge ${device.alive === 1 ? "badge-success" : "badge-error"}`}>
                {device.alive === 1 ? t("devices.online") : t("devices.offline")}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="text-xs font-mono bg-gray-700/50 px-2 py-0.5 rounded">{device.did}</span>
              <span>·</span>
              <span>{roomName}</span>
            </div>
            {device.funcs && device.funcs.length > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                <span>{t("devices.funcCodes")}: </span>
                <span className="font-mono text-blue-400">[{device.funcs.join(", ")}]</span>
                <span className="ml-2">{t("devices.resolvedAs")}: </span>
                <span className={`font-mono ${resolvedFunc === 4 ? "text-green-400" : resolvedFunc === 5 ? "text-purple-400" : "text-gray-400"}`}>
                  {resolvedFunc === 4 ? t("deviceType.1984dual") : resolvedFunc === 5 ? t("deviceType.1984hsl") : resolvedFunc === 3 ? t("deviceType.1984dim") : resolvedFunc === 2 ? t("deviceType.1984switch") : `func=${resolvedFunc}`}
                </span>
              </div>
            )}
          </div>

          {isLight && (
            <div className="space-y-6">
              {/* 开关控制 */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">{t("drawer.switchControl")}</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleSwitch(true)}
                    className={`btn flex-1 ${isOn ? "btn-primary" : "btn-secondary"}`}
                  >
                    <i className="fas fa-power-off"></i>
                    <span>{t("drawer.turnOn")}</span>
                  </button>
                  <button
                    onClick={() => handleSwitch(false)}
                    className={`btn flex-1 ${!isOn ? "btn-primary" : "btn-secondary"}`}
                  >
                    <i className="fas fa-power-off"></i>
                    <span>{t("drawer.turnOff")}</span>
                  </button>
                </div>
              </div>

              {/* 亮度控制 */}
              {isDimmable && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-gray-400">{t("drawer.brightness")}</label>
                    <span className="text-white font-medium">{brightness}%</span>
                  </div>
                  <input
                    type="range"
                    className="slider"
                    min="0"
                    max="100"
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    onMouseUp={(e) => handleBrightness(Number((e.target as HTMLInputElement).value))}
                  />
                </div>
              )}

              {/* 色温控制 */}
              {hasColorTemp && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-gray-400">{t("drawer.colorTemp")}</label>
                    <span className="text-white font-medium">{colorTemp}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{t("drawer.warmLight")}</span>
                    <input
                      type="range"
                      className="slider flex-1"
                      min="0"
                      max="100"
                      value={colorTemp}
                      onChange={(e) => setColorTemp(Number(e.target.value))}
                      onMouseUp={(e) => handleColorTemp(Number((e.target as HTMLInputElement).value))}
                    />
                    <span className="text-xs text-gray-400">{t("drawer.coolLight")}</span>
                  </div>
                </div>
              )}

              {/* RGB颜色控制 */}
              {hasRGB && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-3">{t("drawer.rgbColor")}</label>
                  <div className="grid grid-cols-6 gap-2">
                    {["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF", "#FFFFFF", "#FFA500", "#800080", "#008000", "#000080", "#808080"].map((color) => (
                      <button
                        key={color}
                        onClick={() => handleRGB(color)}
                        className="w-full h-10 rounded-lg border-2 border-white/20 hover:border-white/50 transition-all"
                        style={{ background: color }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 场景切换 */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">{t("drawer.sceneSwitch")}</label>
                <div className="grid grid-cols-2 gap-3">
                  <button className="btn btn-secondary">{t("drawer.meetingMode")}</button>
                  <button className="btn btn-secondary">{t("drawer.demoMode")}</button>
                  <button className="btn btn-secondary">{t("drawer.restMode")}</button>
                  <button className="btn btn-secondary">{t("drawer.cleanMode")}</button>
                </div>
              </div>
            </div>
          )}

          {/* 窗帘设备 */}
          {(device.type === 1860 || device.type === 1861 || device.type === 1862) && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">{t("drawer.curtainControl")}</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => onControl(device.did, "level", [0], device.meshid, 1000)}
                    className="btn btn-secondary flex-1"
                  >
                    <i className="fas fa-arrow-up"></i>
                    <span>{t("automation.curtainOpen")}</span>
                  </button>
                  <button
                    onClick={() => onControl(device.did, "level", [50], device.meshid, 0)}
                    className="btn btn-secondary flex-1"
                  >
                    <i className="fas fa-stop"></i>
                    <span>{t("drawer.stop")}</span>
                  </button>
                  <button
                    onClick={() => onControl(device.did, "level", [100], device.meshid, 1000)}
                    className="btn btn-secondary flex-1"
                  >
                    <i className="fas fa-arrow-down"></i>
                    <span>{t("automation.curtainClosed")}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 面板设备 */}
          {device.type === 1218 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">{t("drawer.buttonConfig")}</label>
                <p className="text-sm text-gray-500">{t("drawer.panelHint")}</p>
              </div>
            </div>
          )}

          {/* 传感器设备 */}
          {device.type === 1344 && (
            <div className="space-y-6">
              <div className="p-4 bg-white/5 rounded-lg">
                <label className="block text-sm font-medium text-gray-400 mb-2">{t("drawer.sensorStatus")}</label>
                <p className="text-lg text-white font-medium">{device.value?.[0] || "N/A"}</p>
              </div>
            </div>
          )}

          {/* 设备详情 */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <h4 className="text-sm font-medium text-gray-400 mb-3">{t("drawer.deviceInfo")}</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{t("devices.type")}</span>
                <span className="text-white">{DEVICE_TYPE_LABELS[device.type] || t("drawer.typeFallback", { type: device.type })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t("drawer.productId")}</span>
                <span className="text-white">{device.pid}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t("drawer.firmwareVersion")}</span>
                <span className="text-white">{device.ver}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Mesh ID</span>
                <span className="text-white text-xs">{device.meshid}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
