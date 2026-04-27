import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from '@astribot/ui';
import { ArrowLeft, Play, Rocket, Square, Trash2, Upload } from 'lucide-react';
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

function CategoryPanel({ category }: { category: string }) {
  const [pairs, setPairs] = useState<AssetPair[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<number | null>(null);
  const [playingAction, setPlayingAction] = useState<number | null>(null);
  const hdf5Ref = useRef<HTMLInputElement>(null);
  const mp3Ref = useRef<HTMLInputElement>(null);
// PLACEHOLDER_HANDLERS

  const loadPairs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.listAssets(category);
      if (res.success) setPairs(res.pairs || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [category]);

  useEffect(() => { loadPairs(); }, [loadPairs]);

  const handleUpload = async () => {
    const hdf5 = hdf5Ref.current?.files?.[0];
    const mp3 = mp3Ref.current?.files?.[0];
    if (!hdf5 && !mp3) return;
    setUploading(true);
    try {
      const res = await apiService.uploadAssetPair(category, hdf5, mp3);
      if (res.success) {
        if (hdf5Ref.current) hdf5Ref.current.value = '';
        if (mp3Ref.current) mp3Ref.current.value = '';
        loadPairs();
      }
    } catch { /* ignore */ } finally { setUploading(false); }
  };

  const handleDelete = async (idx: number) => {
    if (!confirm(`确定删除编号 #${idx} 的素材？`)) return;
    try {
      const res = await apiService.deleteAssetPair(category, idx);
      if (res.success) loadPairs();
    } catch { /* ignore */ }
  };

  const handlePreviewAudio = async (idx: number) => {
    try {
      if (playingAudio === idx) { await apiService.stopAudio(); setPlayingAudio(null); return; }
      await apiService.previewAudio(category, idx);
      setPlayingAudio(idx);
    } catch { /* ignore */ }
  };

  const handlePreviewAction = async (idx: number) => {
    try {
      if (playingAction === idx) { await apiService.stopAction(); setPlayingAction(null); return; }
      await apiService.previewAction(category, idx);
      setPlayingAction(idx);
    } catch { /* ignore */ }
  };

// PLACEHOLDER_RENDER

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">HDF5 轨迹</span>
            <input ref={hdf5Ref} type="file" accept=".hdf5" className="block text-sm file:mr-2 file:rounded file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:text-primary" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">MP3 音频</span>
            <input ref={mp3Ref} type="file" accept=".mp3" className="block text-sm file:mr-2 file:rounded file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:text-primary" />
          </label>
          <Button size="sm" onClick={handleUpload} disabled={uploading}>
            <Upload className="mr-1 h-3.5 w-3.5" />{uploading ? '上传中...' : '上传'}
          </Button>
          <span className="text-xs text-muted-foreground">可同时上传或单独上传，自动配对同编号</span>
        </CardContent>
      </Card>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">加载中...</p>
      ) : pairs.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">暂无素材</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">编号</th>
                  <th className="px-4 py-2 font-medium">HDF5 轨迹</th>
                  <th className="px-4 py-2 font-medium">MP3 音频</th>
                  <th className="px-4 py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map(p => (
                  <tr key={p.index} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">#{p.index}</td>
                    <td className="px-4 py-2">{p.hdf5 ? <span className="text-xs">{p.hdf5.filename} <span className="text-muted-foreground">({formatSize(p.hdf5.size)})</span></span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-2">{p.audio ? <span className="text-xs">{p.audio.filename} <span className="text-muted-foreground">({formatSize(p.audio.size)})</span></span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                    <td className="flex gap-1 px-4 py-2">
                      {p.audio && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePreviewAudio(p.index)}>{playingAudio === p.index ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</Button>}
                      {p.hdf5 && <Button variant="ghost" size="icon" className={cn('h-7 w-7', playingAction === p.index && 'text-destructive')} onClick={() => handlePreviewAction(p.index)}>{playingAction === p.index ? <Square className="h-3.5 w-3.5" /> : <Rocket className="h-3.5 w-3.5" />}</Button>}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(p.index)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// PLACEHOLDER_EXPORT

export function AssetManager() {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center gap-4 border-b px-6 py-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          <ArrowLeft className="mr-1 h-4 w-4" />返回
        </Button>
        <h1 className="text-base font-semibold">素材管理</h1>
      </header>
      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="yingbin">
          <TabsList>
            {Object.entries(CATEGORIES).map(([key, label]) => (
              <TabsTrigger key={key} value={key}>{label}</TabsTrigger>
            ))}
          </TabsList>
          {Object.keys(CATEGORIES).map(key => (
            <TabsContent key={key} value={key}>
              <CategoryPanel category={key} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
