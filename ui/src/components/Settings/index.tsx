import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, Info, SlidersHorizontal } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@astribot/ui';
import { settingsService } from '@/services/settings';
import { RobotShapeType, type RobotShapeConfig } from '@/types';

const MetaServicesPanel = lazy(() =>
  import('./MetaServicesPanel').then((module) => ({ default: module.MetaServicesPanel })),
);

type SettingsTab = 'robot-shape' | 'meta-services' | 'about';

function getRectangleSize(shape: RobotShapeConfig) {
  if (shape.type !== RobotShapeType.POLYGON || !shape.vertices || shape.vertices.length < 4) {
    return { length: 0.6, width: 0.4 };
  }
  const xValues = shape.vertices.map((vertex) => vertex.x);
  const yValues = shape.vertices.map((vertex) => vertex.y);
  return {
    length: Math.max(...xValues) - Math.min(...xValues),
    width: Math.max(...yValues) - Math.min(...yValues),
  };
}

function buildPolygonShape(length: number, width: number): RobotShapeConfig {
  const halfLength = length / 2;
  const halfWidth = width / 2;
  return {
    type: RobotShapeType.POLYGON,
    vertices: [
      { x: halfLength, y: halfWidth },
      { x: halfLength, y: -halfWidth },
      { x: -halfLength, y: -halfWidth },
      { x: -halfLength, y: halfWidth },
    ],
  };
}

export function Settings() {
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState<SettingsTab>('robot-shape');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [robotShape, setRobotShape] = useState<RobotShapeConfig>(settingsService.getRobotShape());
  const [radius, setRadius] = useState(() => String(settingsService.getRobotShape().radius ?? 0.3));
  const [dimensions, setDimensions] = useState(() => getRectangleSize(settingsService.getRobotShape()));

  useEffect(() => {
    const currentShape = settingsService.getRobotShape();
    setRobotShape(currentShape);
    setRadius(String(currentShape.radius ?? 0.3));
    setDimensions(getRectangleSize(currentShape));
  }, []);

  const preview = useMemo(() => {
    if (robotShape.type === RobotShapeType.CIRCLE) {
      const currentRadius = Number(radius) || 0.3;
      return {
        title: '圆形碰撞边界',
        lines: [`半径 ${currentRadius.toFixed(2)} m`, `直径 ${(currentRadius * 2).toFixed(2)} m`],
      };
    }
    return {
      title: '矩形碰撞边界',
      lines: [`长度 ${dimensions.length.toFixed(2)} m`, `宽度 ${dimensions.width.toFixed(2)} m`],
    };
  }, [dimensions.length, dimensions.width, radius, robotShape.type]);

  function handleShapeTypeChange(type: RobotShapeType) {
    setRobotShape((prev) => {
      if (type === RobotShapeType.CIRCLE) {
        return { type: RobotShapeType.CIRCLE, radius: Number(radius) || 0.3 };
      }
      return buildPolygonShape(dimensions.length, dimensions.width);
    });
  }

  function saveRobotShape() {
    const nextShape =
      robotShape.type === RobotShapeType.CIRCLE
        ? { type: RobotShapeType.CIRCLE, radius: Number(radius) || 0.3 }
        : buildPolygonShape(dimensions.length, dimensions.width);
    settingsService.setRobotShape(nextShape);
    setRobotShape(nextShape);
    setStatusMessage('机器人碰撞形状已保存。');
  }

  function resetRobotShape() {
    settingsService.resetToDefaults();
    const defaultShape = settingsService.getRobotShape();
    setRobotShape(defaultShape);
    setRadius(String(defaultShape.radius ?? 0.3));
    setDimensions(getRectangleSize(defaultShape));
    setStatusMessage('已恢复默认碰撞形状。');
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card/80 p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Button variant="ghost" className="-ml-3 w-fit" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回主页
          </Button>
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">System Settings</div>
            <h1 className="text-2xl font-semibold text-foreground">系统设置</h1>
            <p className="text-sm text-muted-foreground">统一管理导航 App 的碰撞边界、Meta 服务配置和应用说明。</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant={selectedTab === 'robot-shape' ? 'default' : 'secondary'} onClick={() => setSelectedTab('robot-shape')}>
            <Bot className="mr-2 h-4 w-4" />
            碰撞形状
          </Button>
          <Button variant={selectedTab === 'meta-services' ? 'default' : 'secondary'} onClick={() => setSelectedTab('meta-services')}>
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Meta 服务
          </Button>
          <Button variant={selectedTab === 'about' ? 'default' : 'secondary'} onClick={() => setSelectedTab('about')}>
            <Info className="mr-2 h-4 w-4" />
            关于
          </Button>
        </div>
      </section>

      {statusMessage && (
        <Card className="border-border bg-secondary/40">
          <CardContent className="p-4 text-sm text-muted-foreground">{statusMessage}</CardContent>
        </Card>
      )}

      {selectedTab === 'robot-shape' && (
        <section className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
          <Card className="border-border bg-card/80 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-4 w-4 text-primary" />
                机器人碰撞形状
              </CardTitle>
              <CardDescription>用于导航时的安全边界计算。当前只支持圆形和矩形两种配置。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-2">
                <Button
                  variant={robotShape.type === RobotShapeType.CIRCLE ? 'default' : 'secondary'}
                  onClick={() => handleShapeTypeChange(RobotShapeType.CIRCLE)}
                >
                  圆形
                </Button>
                <Button
                  variant={robotShape.type === RobotShapeType.POLYGON ? 'default' : 'secondary'}
                  onClick={() => handleShapeTypeChange(RobotShapeType.POLYGON)}
                >
                  矩形
                </Button>
              </div>

              {robotShape.type === RobotShapeType.CIRCLE ? (
                <div className="space-y-2">
                  <Label htmlFor="robot-radius">半径（米）</Label>
                  <Input
                    id="robot-radius"
                    type="number"
                    min="0.1"
                    max="2.0"
                    step="0.05"
                    value={radius}
                    onChange={(event) => setRadius(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">建议值 0.30m。用于碰撞检测和可通行区域判断。</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="robot-length">长度（X 方向）</Label>
                    <Input
                      id="robot-length"
                      type="number"
                      min="0.1"
                      max="3.0"
                      step="0.1"
                      value={String(dimensions.length)}
                      onChange={(event) =>
                        setDimensions((prev) => ({ ...prev, length: Number(event.target.value) || 0.6 }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="robot-width">宽度（Y 方向）</Label>
                    <Input
                      id="robot-width"
                      type="number"
                      min="0.1"
                      max="3.0"
                      step="0.1"
                      value={String(dimensions.width)}
                      onChange={(event) =>
                        setDimensions((prev) => ({ ...prev, width: Number(event.target.value) || 0.4 }))
                      }
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button onClick={saveRobotShape}>保存设置</Button>
                <Button variant="secondary" onClick={resetRobotShape}>
                  恢复默认
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">当前配置预览</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Badge variant="secondary">{preview.title}</Badge>
              <div className="space-y-2 text-sm text-muted-foreground">
                {preview.lines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {selectedTab === 'meta-services' && (
        <Suspense fallback={<Card className="border-border bg-card/80"><CardContent className="p-6 text-sm text-muted-foreground">正在加载 Meta 服务配置...</CardContent></Card>}>
          <MetaServicesPanel />
        </Suspense>
      )}

      {selectedTab === 'about' && (
        <Card className="max-w-3xl border-border bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="h-4 w-4 text-primary" />
              关于 Navigation App
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Astribot Navigation UI</p>
            <p>版本: 1.1.0</p>
            <p>用于机器人 SLAM 建图、自主导航、任务编排与运行监控。</p>
            <p>当前页面已经开始向 Astribot OS 模板风格迁移，后续仍会继续收敛公共组件和交互模式。</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
