#!/usr/bin/env python3
"""
Mock Fall Detection Meta Service - 用于开发和测试
模拟 VLM 跌倒检测结果，支持随机触发跌倒事件

运行方式:
  python mock_fall_detection.py --standalone  # 独立测试模式
  # 或配合 astribot_link 使用 (需要 ROS2 环境和 meta_base)
"""
from __future__ import annotations

import logging
import os
import sys
import time
import random
import argparse
from enum import Enum

try:
    from meta_base import MetaBase, TransitionResult
    HAS_META_BASE = True
except ImportError:
    HAS_META_BASE = False
    class TransitionResult(Enum):
        SUCCESS = "success"
        FAILURE = "failure"


class FallConfig:
    def __init__(self):
        self.simulated: bool = True
        self.confidence_threshold: float = 0.8
        self.fall_probability: float = 0.1


class FallDetection:
    """
    Mock fall detection service for development/testing.
    """

    def __init__(self) -> None:
        self.name = "fall_detection"
        self.state = "active"
        self._detected_fall = None
        self._acknowledged = False
        self.config = FallConfig()
        self._logger = logging.getLogger(f"meta.{self.name}")

    def on_configure(self, config: dict) -> TransitionResult:
        self.config.simulated = config.get("simulated", True)
        self.config.confidence_threshold = config.get("confidence_threshold", 0.8)
        self.config.fall_probability = config.get("fall_probability", 0.1)
        self._logger.info(f"Fall detection configured: simulated={self.config.simulated}")
        return TransitionResult.SUCCESS

    def on_activate(self) -> TransitionResult:
        self._logger.info("Fall detection activated")
        return TransitionResult.SUCCESS

    def on_deactivate(self) -> TransitionResult:
        self._detected_fall = None
        self._logger.info("Fall detection deactivated")
        return TransitionResult.SUCCESS

    def get_status(self) -> dict:
        return {
            "is_running": True,
            "state": self.state,
            "simulated": self.config.simulated,
        }

    def get_fall_status(self) -> dict:
        """
        获取全局跌倒检测状态（全任务周期监测，不绑定特定房间）

        返回:
          {
            "is_fall": bool,           # 是否检测到跌倒
            "location": str | None,    # 跌倒位置（由服务检测，非调用方传入）
            "confidence": float,       # 置信度
            "acknowledged": bool,      # 是否已确认
          }
        """
        if self._acknowledged:
            if self._detected_fall:
                self._logger.info(f"Fall acknowledged at {self._detected_fall['location']}")
            self._detected_fall = None
            self._acknowledged = False

        if self._detected_fall:
            return {
                "is_fall": True,
                "location": self._detected_fall["location"],
                "confidence": self._detected_fall["confidence"],
                "acknowledged": False,
            }

        if self.config.simulated:
            if random.random() < self.config.fall_probability:
                # 模拟跌倒检测：位置由服务自行判断（模拟 VLM 识别到的位置）
                location = f"room_{random.randint(100, 109)}"
                confidence = random.uniform(
                    self.config.confidence_threshold,
                    0.98
                )
                self._detected_fall = {
                    "location": location,
                    "confidence": confidence,
                    "timestamp": time.time(),
                }
                self._logger.info(f"FALL DETECTED at {location} (confidence={confidence:.2f})")
                return {
                    "is_fall": True,
                    "location": location,
                    "confidence": confidence,
                    "acknowledged": False,
                }

        return {
            "is_fall": False,
            "location": None,
            "confidence": 0.0,
            "acknowledged": False,
        }

    def ack_fall(self) -> dict:
        if self._detected_fall:
            self._logger.info(f"Fall acknowledged: {self._detected_fall}")
        self._acknowledged = True
        return {"success": True, "message": "Fall acknowledged"}

    def set_simulation_mode(self, enabled: bool) -> dict:
        self.config.simulated = enabled
        self._detected_fall = None
        mode = "simulated" if enabled else "disabled"
        self._logger.info(f"Simulation mode: {mode}")
        return {"success": True, "mode": mode}

    def trigger_fall(self, location: str, confidence: float = 0.9) -> dict:
        self._detected_fall = {
            "location": location,
            "confidence": confidence,
            "timestamp": time.time(),
        }
        self._logger.info(f"Manual fall triggered at {location} (confidence={confidence})")
        return {"success": True, "location": location, "confidence": confidence}

    def clear_fall(self) -> dict:
        self._detected_fall = None
        self._acknowledged = False
        return {"success": True}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mock Fall Detection Meta Service")
    parser.add_argument("--standalone", action="store_true", help="Run in standalone test mode")
    parser.add_argument("--simulated", action="store_true", default=True, help="Enable simulation mode")
    parser.add_argument("--probability", type=float, default=0.1, help="Fall detection probability")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format='[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s'
    )

    print("Testing FallDetection mock service...")
    meta = FallDetection()
    print(f"Initial status: {meta.get_status()}")

    print("\nConfiguring...")
    result = meta.on_configure({
        "simulated": args.simulated,
        "fall_probability": args.probability
    })
    print(f"  Configure result: {result}")

    print("\nActivating...")
    result = meta.on_activate()
    print(f"  Activate result: {result}")

    print(f"\nCalling get_fall_status() 10 times (probability={args.probability}):")
    fall_count = 0
    for i in range(10):
        result = meta.get_fall_status()  # 全局检测，无需传 room_id
        print(f"  {i+1}: is_fall={result['is_fall']}, location={result['location']}")

        if result['is_fall']:
            fall_count += 1
            print(f"  -> Acknowledging fall...")
            meta.ack_fall()

    print(f"\nTotal falls detected: {fall_count}/10")

    print("\nManual fall trigger test:")
    meta.trigger_fall("room_201", 0.95)
    print(f"  After trigger: {meta.get_fall_status()}")
    meta.ack_fall()
    print(f"  After ack: {meta.get_fall_status()}")

    print("\nDeactivating...")
    meta.on_deactivate()

    print("\nTest complete.")
    print("\n提示：如需后台运行，请将服务集成到 mock_rosbridge.py 中（已实现）")
    print("       或创建独立的 ROS2 node 对接 meta.fall_detection")