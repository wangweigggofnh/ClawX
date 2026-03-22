/**
 * Dashboard Page (面板)
 * Gateway status, developer panel, AI models overview, IM channels overview.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useGatewayStore } from '@/stores/gateway';
import { useChannelsStore } from '@/stores/channels';
import { useSettingsStore } from '@/stores/settings';
import { hostApiFetch } from '@/lib/host-api';
import { invokeIpc } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export function Dashboard() {
  const { t } = useTranslation(['dashboard', 'common', 'settings']);
  const navigate = useNavigate();
  const { status: gatewayStatus, restart: restartGateway } = useGatewayStore();
  const channels = useChannelsStore((s) => s.channels);
  const isGatewayRunning = gatewayStatus.state === 'running';

  const [gatewayExpanded, setGatewayExpanded] = useState(true);
  const [devExpanded, setDevExpanded] = useState(true);
  const [modelsExpanded, setModelsExpanded] = useState(false);
  const [channelsExpanded, setChannelsExpanded] = useState(false);
  const [currentModel, setCurrentModel] = useState<string>('');
  const [modelCount, setModelCount] = useState(0);
  const [channelCount, setChannelCount] = useState(0);
  const [doctorRunning, setDoctorRunning] = useState(false);

  useEffect(() => {
    setChannelCount(channels.length);
  }, [channels]);

  useEffect(() => {
    if (!isGatewayRunning) return;
    hostApiFetch<{ success: boolean; providers?: Array<{ modelId?: string }> }>('/api/providers')
      .then((res) => {
        if (res.success && res.providers) {
          setModelCount(res.providers.length);
          const defaultProvider = res.providers[0];
          if (defaultProvider?.modelId) {
            setCurrentModel(defaultProvider.modelId);
          }
        }
      })
      .catch(() => {});
  }, [isGatewayRunning]);

  const handleForceRestart = async () => {
    try {
      await hostApiFetch('/api/gateway/stop', { method: 'POST' });
      await new Promise((resolve) => setTimeout(resolve, 500));
      await hostApiFetch('/api/gateway/start', { method: 'POST' });
      toast.success(t('common:actions.restart'));
    } catch {
      toast.error(t('common:status.error'));
    }
  };

  const handleDoctor = async () => {
    setDoctorRunning(true);
    try {
      const result = await hostApiFetch<{
        success: boolean;
        error?: string;
      }>('/api/app/openclaw-doctor', {
        method: 'POST',
        body: JSON.stringify({ mode: 'fix' }),
      });
      if (result.success) {
        toast.success(t('settings:developer.doctorFixSucceeded'));
      } else {
        toast.error(result.error || t('settings:developer.doctorFixFailed'));
      }
    } catch {
      toast.error(t('settings:developer.doctorRunFailed'));
    } finally {
      setDoctorRunning(false);
    }
  };

  const openDevConsole = async () => {
    try {
      const result = await hostApiFetch<{
        success: boolean;
        url?: string;
      }>('/api/gateway/control-ui');
      if (result.success && result.url) {
        window.electron.openExternal(result.url);
      }
    } catch {
      toast.error(t('common:status.error'));
    }
  };

  const openWorkspaceFolder = async () => {
    try {
      const skillsDir = await invokeIpc<string>('openclaw:getSkillsDir');
      if (skillsDir) {
        const parentDir = skillsDir.replace(/\/skills\/?$/, '');
        await invokeIpc('shell:openPath', parentDir);
      }
    } catch {
      toast.error(t('common:status.error'));
    }
  };

  const SectionHeader = ({ expanded, onToggle, title, children }: {
    expanded: boolean;
    onToggle: () => void;
    title: string;
    children?: React.ReactNode;
  }) => (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 w-full text-left py-3"
    >
      {expanded ? (
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
      <span className="text-[15px] font-semibold text-foreground">{title}</span>
      {children}
    </button>
  );

  return (
    <div className="flex flex-col -m-6 dark:bg-background h-[calc(100vh-2.5rem)] overflow-hidden">
      <div className="w-full max-w-4xl mx-auto flex flex-col h-full p-8 pt-10">
        <div className="flex-1 overflow-y-auto space-y-6">

          {/* Gateway Status */}
          <div>
            <SectionHeader
              expanded={gatewayExpanded}
              onToggle={() => setGatewayExpanded(!gatewayExpanded)}
              title={t('dashboard:gateway')}
            >
              <Badge
                variant="secondary"
                className={cn(
                  "ml-2 text-[11px] font-medium px-2.5 py-0.5 rounded-full",
                  isGatewayRunning
                    ? "bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/20"
                    : "bg-red-500/15 text-red-500 border border-red-500/20"
                )}
              >
                <span className={cn(
                  "inline-block w-1.5 h-1.5 rounded-full mr-1.5",
                  isGatewayRunning ? "bg-green-500" : "bg-red-500"
                )} />
                {isGatewayRunning ? t('common:status.running') : t('common:status.stopped')}
              </Badge>
            </SectionHeader>

            {gatewayExpanded && (
              <div className="grid grid-cols-3 gap-3 mt-2">
                <Button
                  variant="outline"
                  onClick={() => restartGateway()}
                  className="h-11 rounded-xl border-border/50 bg-muted/30 hover:bg-muted/60 text-foreground/80 font-medium text-[13px]"
                >
                  {t('dashboard:quickActions.settings').includes('设置') ? '重启网关' : 'Restart Gateway'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleForceRestart}
                  className="h-11 rounded-xl border-border/50 bg-muted/30 hover:bg-muted/60 text-foreground/80 font-medium text-[13px]"
                >
                  {t('dashboard:quickActions.settings').includes('设置') ? '强制重启' : 'Force Restart'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDoctor}
                  disabled={doctorRunning}
                  className="h-11 rounded-xl border-border/50 bg-green-500/10 hover:bg-green-500/20 text-green-700 dark:text-green-400 font-medium text-[13px]"
                >
                  {doctorRunning
                    ? t('common:status.loading')
                    : (t('dashboard:quickActions.settings').includes('设置') ? '自检修复' : 'Self Repair')}
                </Button>
              </div>
            )}
          </div>

          {/* Developer Panel */}
          <div>
            <SectionHeader
              expanded={devExpanded}
              onToggle={() => setDevExpanded(!devExpanded)}
              title={t('dashboard:quickActions.settings').includes('设置') ? '开发者面板' : 'Developer Panel'}
            />

            {devExpanded && (
              <div className="space-y-3 mt-2">
                <Button
                  onClick={openDevConsole}
                  className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[14px] shadow-none"
                >
                  {t('dashboard:quickActions.settings').includes('设置')
                    ? '打开 OpenClaw 开发者面板'
                    : 'Open OpenClaw Developer Panel'}
                </Button>
                <Button
                  variant="outline"
                  onClick={openWorkspaceFolder}
                  className="w-full h-12 rounded-xl border-border/50 bg-muted/30 hover:bg-muted/60 text-foreground/80 font-medium text-[14px]"
                >
                  {t('dashboard:quickActions.settings').includes('设置')
                    ? '打开工作区文件夹 (~/.openclaw)'
                    : 'Open Workspace Folder (~/.openclaw)'}
                </Button>
              </div>
            )}
          </div>

          {/* AI Models */}
          <div>
            <SectionHeader
              expanded={modelsExpanded}
              onToggle={() => setModelsExpanded(!modelsExpanded)}
              title={t('dashboard:quickActions.settings').includes('设置') ? 'AI 模型' : 'AI Models'}
            >
              <Badge variant="secondary" className="ml-2 text-[11px] font-medium px-2 py-0.5 rounded bg-muted/50 border border-border/30 text-muted-foreground">
                {modelCount}
              </Badge>
              {currentModel && (
                <span className="ml-auto text-[12px] text-muted-foreground font-mono">
                  {currentModel}
                </span>
              )}
            </SectionHeader>

            {modelsExpanded && (
              <div className="mt-2">
                <Button
                  variant="outline"
                  onClick={() => navigate('/models')}
                  className="w-full h-10 rounded-xl border-border/50 bg-muted/30 hover:bg-muted/60 text-foreground/80 font-medium text-[13px]"
                >
                  {t('dashboard:quickActions.settings').includes('设置')
                    ? '管理模型与 API'
                    : 'Manage Models & API'}
                </Button>
              </div>
            )}
          </div>

          {/* IM Channels */}
          <div>
            <SectionHeader
              expanded={channelsExpanded}
              onToggle={() => setChannelsExpanded(!channelsExpanded)}
              title={t('dashboard:quickActions.settings').includes('设置') ? 'IM 渠道' : 'IM Channels'}
            >
              <Badge variant="secondary" className="ml-2 text-[11px] font-medium px-2 py-0.5 rounded bg-muted/50 border border-border/30 text-muted-foreground">
                {channelCount}
              </Badge>
            </SectionHeader>

            {channelsExpanded && (
              <div className="mt-2">
                <Button
                  variant="outline"
                  onClick={() => navigate('/channels')}
                  className="w-full h-10 rounded-xl border-border/50 bg-muted/30 hover:bg-muted/60 text-foreground/80 font-medium text-[13px]"
                >
                  {t('dashboard:quickActions.settings').includes('设置')
                    ? '管理 IM 渠道'
                    : 'Manage IM Channels'}
                </Button>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

export default Dashboard;
