import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Tabs, Table, Upload, Space, Popconfirm, message, Tag, Card, Row, Col } from 'antd';
import {
  ArrowLeftOutlined,
  UploadOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  SoundOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { apiService } from '@/services/api';

const CATEGORIES: Record<string, string> = {
  yingbin: '迎宾',
  yinling: '引领',
  zhantingjiangjie: '展厅讲解',
  gaobie: '告别',
};

interface AssetPair {
  index: number;
  hdf5: { filename: string; size: number; mtime: number } | null;
  audio: { filename: string; size: number; mtime: number } | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CategoryPanel: React.FC<{ category: string }> = ({ category }) => {
  const [pairs, setPairs] = useState<AssetPair[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hdf5File, setHdf5File] = useState<File | null>(null);
  const [mp3File, setMp3File] = useState<File | null>(null);
  const [playingAudio, setPlayingAudio] = useState<number | null>(null);
  const [playingAction, setPlayingAction] = useState<number | null>(null);

  const loadPairs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.listAssets(category);
      if (res.success) setPairs(res.pairs || []);
    } catch (e: any) {
      message.error(`加载失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => { loadPairs(); }, [loadPairs]);
// PLACEHOLDER_HANDLERS

  const handleUpload = async () => {
    if (!hdf5File && !mp3File) { message.warning('请至少选择一个文件'); return; }
    setUploading(true);
    try {
      const res = await apiService.uploadAssetPair(category, hdf5File || undefined, mp3File || undefined);
      if (res.success) {
        message.success(`上传成功，编号 #${res.pair_index}`);
        setHdf5File(null);
        setMp3File(null);
        loadPairs();
      } else {
        message.error(res.message);
      }
    } catch (e: any) {
      message.error(`上传失败: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (pairIndex: number) => {
    try {
      const res = await apiService.deleteAssetPair(category, pairIndex);
      if (res.success) { message.success(res.message); loadPairs(); }
      else message.error(res.message);
    } catch (e: any) { message.error(`删除失败: ${e.message}`); }
  };

  const handlePreviewAudio = async (idx: number) => {
    try {
      if (playingAudio === idx) { await apiService.stopAudio(); setPlayingAudio(null); return; }
      await apiService.previewAudio(category, idx);
      setPlayingAudio(idx);
    } catch (e: any) { message.error(`音频预览失败: ${e.message}`); }
  };

  const handlePreviewAction = async (idx: number) => {
    try {
      if (playingAction === idx) { await apiService.stopAction(); setPlayingAction(null); return; }
      await apiService.previewAction(category, idx);
      setPlayingAction(idx);
    } catch (e: any) { message.error(`动作预览失败: ${e.message}`); }
  };

  const columns = [
    { title: '编号', dataIndex: 'index', key: 'index', width: 80 },
    {
      title: 'HDF5 轨迹', key: 'hdf5',
      render: (_: any, r: AssetPair) => r.hdf5
        ? <span>{r.hdf5.filename} <Tag color="blue">{formatSize(r.hdf5.size)}</Tag></span>
        : <Tag color="default">未上传</Tag>,
    },
    {
      title: 'MP3 音频', key: 'audio',
      render: (_: any, r: AssetPair) => r.audio
        ? <span>{r.audio.filename} <Tag color="green">{formatSize(r.audio.size)}</Tag></span>
        : <Tag color="default">未上传</Tag>,
    },
    {
      title: '操作', key: 'actions', width: 300,
      render: (_: any, r: AssetPair) => (
        <Space>
          {r.audio && (
            <Button size="small" type={playingAudio === r.index ? 'primary' : 'default'}
              icon={playingAudio === r.index ? <PauseCircleOutlined /> : <SoundOutlined />}
              onClick={() => handlePreviewAudio(r.index)}>
              {playingAudio === r.index ? '停止' : '播放'}
            </Button>
          )}
          {r.hdf5 && (
            <Button size="small" type={playingAction === r.index ? 'primary' : 'default'}
              danger={playingAction === r.index}
              icon={playingAction === r.index ? <PauseCircleOutlined /> : <RocketOutlined />}
              onClick={() => handlePreviewAction(r.index)}>
              {playingAction === r.index ? '停止' : '预览'}
            </Button>
          )}
          <Popconfirm title="确定删除该组素材？" onConfirm={() => handleDelete(r.index)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col>
            <Upload accept=".hdf5" maxCount={1} beforeUpload={(f) => { setHdf5File(f); return false; }}
              fileList={hdf5File ? [{ uid: '-1', name: hdf5File.name, status: 'done' } as any] : []}
              onRemove={() => setHdf5File(null)}>
              <Button icon={<UploadOutlined />}>选择 HDF5</Button>
            </Upload>
          </Col>
          <Col>
            <Upload accept=".mp3" maxCount={1} beforeUpload={(f) => { setMp3File(f); return false; }}
              fileList={mp3File ? [{ uid: '-2', name: mp3File.name, status: 'done' } as any] : []}
              onRemove={() => setMp3File(null)}>
              <Button icon={<UploadOutlined />}>选择 MP3</Button>
            </Upload>
          </Col>
          <Col>
            <Button type="primary" onClick={handleUpload} loading={uploading} disabled={!hdf5File && !mp3File}>
              上传
            </Button>
          </Col>
          <Col style={{ color: '#999', fontSize: 12 }}>
            可同时上传 HDF5+MP3（同编号），也可单独上传（自动补到缺失的组）
          </Col>
        </Row>
      </Card>
      <Table columns={columns} dataSource={pairs} rowKey="index" loading={loading} pagination={false} size="middle"
        locale={{ emptyText: '暂无素材' }} />
    </div>
  );
};

// PLACEHOLDER_EXPORT

export const AssetManager: React.FC = () => {
  const navigate = useNavigate();
  const tabItems = Object.entries(CATEGORIES).map(([key, label]) => ({
    key, label, children: <CategoryPanel category={key} />,
  }));

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <div style={{ padding: '12px 24px', background: '#fff', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>返回</Button>
        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>素材管理</div>
      </div>
      <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        <Tabs items={tabItems} destroyInactiveTabPane />
      </div>
    </div>
  );
};
