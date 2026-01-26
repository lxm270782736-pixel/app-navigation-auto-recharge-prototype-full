import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, Menu, Button, Form, InputNumber, Radio, Card, message } from 'antd';
import {
  ArrowLeftOutlined,
  RobotOutlined,
  SettingOutlined,
  SafetyCertificateOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { settingsService } from '@/services/settings';
import { RobotShapeType, RobotShapeConfig } from '@/types';

const { Sider, Content } = Layout;

// 设置菜单项
type SettingsMenuKey = 'robot-shape' | 'about';

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [selectedKey, setSelectedKey] = useState<SettingsMenuKey>('robot-shape');

  // 机器人碰撞形状配置
  const [robotShape, setRobotShape] = useState<RobotShapeConfig>(settingsService.getRobotShape());
  const [form] = Form.useForm();

  // 初始化表单
  useEffect(() => {
    const currentShape = settingsService.getRobotShape();
    setRobotShape(currentShape);

    // 如果是多边形，计算长宽
    let length = 0.6;
    let width = 0.4;
    if (currentShape.type === RobotShapeType.POLYGON && currentShape.vertices && currentShape.vertices.length >= 4) {
      // 从顶点计算长宽
      const xValues = currentShape.vertices.map(v => v.x);
      const yValues = currentShape.vertices.map(v => v.y);
      length = Math.max(...xValues) - Math.min(...xValues);
      width = Math.max(...yValues) - Math.min(...yValues);
    }

    form.setFieldsValue({
      shapeType: currentShape.type,
      radius: currentShape.radius || 0.3,
      length,
      width,
    });
  }, [form]);

  // 保存机器人形状设置
  const handleSaveRobotShape = () => {
    const values = form.getFieldsValue();
    let newShape: RobotShapeConfig;

    if (values.shapeType === RobotShapeType.CIRCLE) {
      newShape = {
        type: RobotShapeType.CIRCLE,
        radius: values.radius,
      };
    } else {
      // 多边形：根据长宽生成矩形顶点
      const halfLength = values.length / 2;
      const halfWidth = values.width / 2;
      newShape = {
        type: RobotShapeType.POLYGON,
        vertices: [
          { x: halfLength, y: halfWidth },
          { x: halfLength, y: -halfWidth },
          { x: -halfLength, y: -halfWidth },
          { x: -halfLength, y: halfWidth },
        ],
      };
    }

    settingsService.setRobotShape(newShape);
    setRobotShape(newShape);
    message.success('机器人碰撞形状已保存');
  };

  // 重置为默认设置
  const handleResetRobotShape = () => {
    settingsService.resetToDefaults();
    const defaultShape = settingsService.getRobotShape();
    setRobotShape(defaultShape);
    form.setFieldsValue({
      shapeType: defaultShape.type,
      radius: defaultShape.radius || 0.3,
      length: 0.6,
      width: 0.4,
    });
    message.success('已重置为默认设置');
  };

  // 渲染设置内容
  const renderContent = () => {
    switch (selectedKey) {
      case 'robot-shape':
        return (
          <Card title="机器人碰撞形状" style={{ maxWidth: 600 }}>
            <p style={{ color: '#666', marginBottom: '24px' }}>
              配置机器人的碰撞检测形状，用于导航时的安全检测。
            </p>

            <Form form={form} layout="vertical">
              <Form.Item label="形状类型" name="shapeType">
                <Radio.Group
                  onChange={(e) => setRobotShape({ ...robotShape, type: e.target.value })}
                  buttonStyle="solid"
                >
                  <Radio.Button value={RobotShapeType.CIRCLE}>
                    <SafetyCertificateOutlined /> 圆形
                  </Radio.Button>
                  <Radio.Button value={RobotShapeType.POLYGON}>
                    <RobotOutlined /> 矩形
                  </Radio.Button>
                </Radio.Group>
              </Form.Item>

              {robotShape.type === RobotShapeType.CIRCLE && (
                <Form.Item
                  label="半径 (米)"
                  name="radius"
                  rules={[{ required: true, message: '请输入半径' }]}
                  extra="机器人碰撞检测的半径范围"
                >
                  <InputNumber
                    min={0.1}
                    max={2.0}
                    step={0.05}
                    style={{ width: '100%' }}
                    placeholder="例如: 0.3"
                    addonAfter="m"
                  />
                </Form.Item>
              )}

              {robotShape.type === RobotShapeType.POLYGON && (
                <>
                  <Form.Item
                    label="长度 - X方向 (米)"
                    name="length"
                    rules={[{ required: true, message: '请输入长度' }]}
                    extra="机器人前后方向的长度"
                  >
                    <InputNumber
                      min={0.1}
                      max={3.0}
                      step={0.1}
                      style={{ width: '100%' }}
                      placeholder="例如: 0.6"
                      addonAfter="m"
                    />
                  </Form.Item>
                  <Form.Item
                    label="宽度 - Y方向 (米)"
                    name="width"
                    rules={[{ required: true, message: '请输入宽度' }]}
                    extra="机器人左右方向的宽度"
                  >
                    <InputNumber
                      min={0.1}
                      max={3.0}
                      step={0.1}
                      style={{ width: '100%' }}
                      placeholder="例如: 0.4"
                      addonAfter="m"
                    />
                  </Form.Item>
                </>
              )}

              {/* 当前配置预览 */}
              <div
                style={{
                  marginTop: '16px',
                  padding: '16px',
                  background: '#f5f5f5',
                  borderRadius: '8px',
                  border: '1px solid #e8e8e8',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
                  当前配置预览
                </div>
                <div style={{ fontSize: '13px', color: '#666' }}>
                  {robotShape.type === RobotShapeType.CIRCLE ? (
                    <>
                      <div>形状: 圆形</div>
                      <div>半径: {robotShape.radius || 0.3} 米</div>
                      <div>直径: {((robotShape.radius || 0.3) * 2).toFixed(2)} 米</div>
                    </>
                  ) : (
                    <>
                      <div>形状: 矩形</div>
                      {robotShape.vertices && robotShape.vertices.length >= 4 ? (
                        <>
                          <div>
                            长度: {(Math.max(...robotShape.vertices.map(v => v.x)) - Math.min(...robotShape.vertices.map(v => v.x))).toFixed(2)} 米
                          </div>
                          <div>
                            宽度: {(Math.max(...robotShape.vertices.map(v => v.y)) - Math.min(...robotShape.vertices.map(v => v.y))).toFixed(2)} 米
                          </div>
                        </>
                      ) : (
                        <div>顶点: 未配置</div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 操作按钮 */}
              <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
                <Button type="primary" onClick={handleSaveRobotShape}>
                  保存设置
                </Button>
                <Button onClick={handleResetRobotShape}>
                  重置为默认
                </Button>
              </div>
            </Form>
          </Card>
        );

      case 'about':
        return (
          <Card title="关于" style={{ maxWidth: 600 }}>
            <div style={{ fontSize: '14px', lineHeight: '2' }}>
              <p><strong>Astribot Navigation UI</strong></p>
              <p>版本: 1.0.0</p>
              <p>机器人建图导航系统用户界面</p>
              <p style={{ marginTop: '16px', color: '#666' }}>
                用于机器人 SLAM 建图、自主导航和任务管理的 Web 界面。
              </p>
            </div>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 侧边栏 */}
      <Sider
        width={240}
        style={{
          background: '#fff',
          borderRight: '1px solid #f0f0f0',
        }}
      >
        {/* 返回按钮 */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/')}
            style={{ marginBottom: '8px' }}
          >
            返回首页
          </Button>
          <div style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '8px' }}>
            <SettingOutlined /> 系统设置
          </div>
        </div>

        {/* 菜单 */}
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={(e) => setSelectedKey(e.key as SettingsMenuKey)}
          style={{ borderRight: 0, marginTop: '8px' }}
          items={[
            {
              key: 'robot-shape',
              icon: <RobotOutlined />,
              label: '机器人碰撞形状',
            },
            {
              key: 'about',
              icon: <InfoCircleOutlined />,
              label: '关于',
            },
          ]}
        />
      </Sider>

      {/* 内容区域 */}
      <Content
        style={{
          padding: '24px',
          background: '#f5f5f5',
          minHeight: '100vh',
        }}
      >
        {renderContent()}
      </Content>
    </Layout>
  );
};
