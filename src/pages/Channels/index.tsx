import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, Trash2, AlertCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useGatewayStore } from '@/stores/gateway';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { hostApiFetch } from '@/lib/host-api';
import { subscribeHostEvent } from '@/lib/host-events';
import { ChannelConfigModal } from '@/components/channels/ChannelConfigModal';
import { cn } from '@/lib/utils';
import {
  CHANNEL_ICONS,
  CHANNEL_NAMES,
  CHANNEL_META,
  getPrimaryChannels,
  type ChannelType,
} from '@/types/channel';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import telegramIcon from '@/assets/channels/telegram.svg';
import discordIcon from '@/assets/channels/discord.svg';
import whatsappIcon from '@/assets/channels/whatsapp.svg';
import dingtalkIcon from '@/assets/channels/dingtalk.svg';
import feishuIcon from '@/assets/channels/feishu.svg';
import wecomIcon from '@/assets/channels/wecom.svg';
import qqIcon from '@/assets/channels/qq.svg';

interface ChannelAccountItem {
  accountId: string;
  name: string;
  configured: boolean;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  lastError?: string;
  isDefault: boolean;
  agentId?: string;
}

interface ChannelGroupItem {
  channelType: string;
  defaultAccountId: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  accounts: ChannelAccountItem[];
}

interface AgentItem {
  id: string;
  name: string;
}

interface DeleteTarget {
  channelType: string;
  accountId?: string;
}

function removeDeletedTarget(groups: ChannelGroupItem[], target: DeleteTarget): ChannelGroupItem[] {
  if (target.accountId) {
    return groups
      .map((group) => {
        if (group.channelType !== target.channelType) return group;
        return {
          ...group,
          accounts: group.accounts.filter((account) => account.accountId !== target.accountId),
        };
      })
      .filter((group) => group.accounts.length > 0);
  }

  return groups.filter((group) => group.channelType !== target.channelType);
}

function getChannelPlatformLabel(channelType: string): string {
  const labels: Record<string, string> = {
    feishu: '飞书',
    wecom: '企业微信',
    qqbot: 'QQ',
    telegram: 'Telegram',
    discord: 'Discord',
    whatsapp: 'WhatsApp',
    dingtalk: '钉钉',
    signal: 'Signal',
    imessage: 'iMessage',
    matrix: 'Matrix',
    line: 'LINE',
    msteams: 'Teams',
    googlechat: 'Google Chat',
    mattermost: 'Mattermost',
  };
  return labels[channelType] || channelType;
}

export function Channels() {
  const { t } = useTranslation('channels');
  const gatewayStatus = useGatewayStore((state) => state.status);
  const lastGatewayStateRef = useRef(gatewayStatus.state);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channelGroups, setChannelGroups] = useState<ChannelGroupItem[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedChannelType, setSelectedChannelType] = useState<ChannelType | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(undefined);
  const [allowExistingConfigInModal, setAllowExistingConfigInModal] = useState(true);
  const [allowEditAccountIdInModal, setAllowEditAccountIdInModal] = useState(false);
  const [existingAccountIdsForModal, setExistingAccountIdsForModal] = useState<string[]>([]);
  const [initialConfigValuesForModal, setInitialConfigValuesForModal] = useState<Record<string, string> | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const displayedChannelTypes = getPrimaryChannels();

  const fetchPageData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [channelsRes, agentsRes] = await Promise.all([
        hostApiFetch<{ success: boolean; channels?: ChannelGroupItem[]; error?: string }>('/api/channels/accounts'),
        hostApiFetch<{ success: boolean; agents?: AgentItem[]; error?: string }>('/api/agents'),
      ]);

      if (!channelsRes.success) {
        throw new Error(channelsRes.error || 'Failed to load channels');
      }

      if (!agentsRes.success) {
        throw new Error(agentsRes.error || 'Failed to load agents');
      }

      setChannelGroups(channelsRes.channels || []);
      setAgents(agentsRes.agents || []);
    } catch (fetchError) {
      setError(String(fetchError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPageData();
  }, [fetchPageData]);

  useEffect(() => {
    const unsubscribe = subscribeHostEvent('gateway:channel-status', () => {
      void fetchPageData();
    });
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [fetchPageData]);

  useEffect(() => {
    const previousGatewayState = lastGatewayStateRef.current;
    lastGatewayStateRef.current = gatewayStatus.state;

    if (previousGatewayState !== 'running' && gatewayStatus.state === 'running') {
      void fetchPageData();
    }
  }, [fetchPageData, gatewayStatus.state]);

  const configuredTypes = useMemo(
    () => channelGroups.map((group) => group.channelType),
    [channelGroups],
  );

  const groupedByType = useMemo(() => {
    return Object.fromEntries(channelGroups.map((group) => [group.channelType, group]));
  }, [channelGroups]);

  const configuredGroups = useMemo(() => {
    const known = displayedChannelTypes
      .map((type) => groupedByType[type])
      .filter((group): group is ChannelGroupItem => Boolean(group));
    const unknown = channelGroups.filter((group) => !displayedChannelTypes.includes(group.channelType as ChannelType));
    return [...known, ...unknown];
  }, [channelGroups, displayedChannelTypes, groupedByType]);

  const handleRefresh = () => {
    void fetchPageData();
  };

  const handleBindAgent = async (channelType: string, accountId: string, agentId: string) => {
    try {
      if (!agentId) {
        await hostApiFetch<{ success: boolean; error?: string }>('/api/channels/binding', {
          method: 'DELETE',
          body: JSON.stringify({ channelType, accountId }),
        });
      } else {
        await hostApiFetch<{ success: boolean; error?: string }>('/api/channels/binding', {
          method: 'PUT',
          body: JSON.stringify({ channelType, accountId, agentId }),
        });
      }
      await fetchPageData();
      toast.success(t('toast.bindingUpdated'));
    } catch (bindError) {
      toast.error(t('toast.configFailed', { error: String(bindError) }));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const suffix = deleteTarget.accountId
        ? `?accountId=${encodeURIComponent(deleteTarget.accountId)}`
        : '';
      await hostApiFetch(`/api/channels/config/${encodeURIComponent(deleteTarget.channelType)}${suffix}`, {
        method: 'DELETE',
      });
      setChannelGroups((prev) => removeDeletedTarget(prev, deleteTarget));
      toast.success(deleteTarget.accountId ? t('toast.accountDeleted') : t('toast.channelDeleted'));
      window.setTimeout(() => {
        void fetchPageData();
      }, 1200);
    } catch (deleteError) {
      toast.error(t('toast.configFailed', { error: String(deleteError) }));
    } finally {
      setDeleteTarget(null);
    }
  };

  const createNewAccountId = (channelType: string, existingAccounts: string[]): string => {
    let nextAccountId = `${channelType}-${crypto.randomUUID().slice(0, 8)}`;
    while (existingAccounts.includes(nextAccountId)) {
      nextAccountId = `${channelType}-${crypto.randomUUID().slice(0, 8)}`;
    }
    return nextAccountId;
  };

  if (loading) {
    return (
      <div className="flex flex-col -m-6 dark:bg-background min-h-[calc(100vh-2.5rem)] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col -m-6 dark:bg-background h-[calc(100vh-2.5rem)] overflow-hidden">
      <div className="w-full max-w-4xl mx-auto flex flex-col h-full p-8 pt-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">
              IM {t('title')}
            </h1>
            <p className="text-[13px] text-muted-foreground">
              {t('subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={gatewayStatus.state !== 'running'}
              className="h-9 rounded-xl px-4 font-semibold text-[13px]"
            >
              {t('refresh')}
            </Button>
            <Button
              onClick={() => {
                setSelectedChannelType(null);
                setSelectedAccountId(undefined);
                setAllowExistingConfigInModal(true);
                setAllowEditAccountIdInModal(false);
                setExistingAccountIdsForModal([]);
                setInitialConfigValuesForModal(undefined);
                setShowConfigModal(true);
              }}
              className="h-9 rounded-xl px-4 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[13px] shadow-none"
            >
              {t('addChannel')}
            </Button>
          </div>
        </div>

        {/* Warnings */}
        {gatewayStatus.state !== 'running' && (
          <div className="mb-4 p-3 rounded-xl border border-yellow-500/50 bg-yellow-500/10 flex items-center gap-3">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-yellow-700 dark:text-yellow-400 text-[13px] font-medium">
              {t('gatewayWarning')}
            </span>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-xl border border-destructive/50 bg-destructive/10 flex items-center gap-3">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-destructive text-[13px] font-medium">{error}</span>
          </div>
        )}

        {/* Channel Cards */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-6">
          {configuredGroups.map((group) => (
            <div
              key={group.channelType}
              className="rounded-2xl border border-border/50 bg-card/50 p-5 hover:bg-card/80 transition-colors"
            >
              {group.accounts.map((account) => {
                const displayName = account.accountId === 'default' && account.name === account.accountId
                  ? (CHANNEL_NAMES[group.channelType as ChannelType] || group.channelType)
                  : account.name;

                const agentName = account.agentId
                  ? agents.find((a) => a.id === account.agentId)?.name || account.agentId
                  : undefined;

                return (
                  <div key={`${group.channelType}-${account.accountId}`}>
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="h-12 w-12 shrink-0 flex items-center justify-center rounded-xl bg-muted/50 border border-border/30">
                        <ChannelLogo type={group.channelType as ChannelType} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-[16px] font-bold text-foreground">{displayName}</h3>
                          <Badge variant="secondary" className="text-[10px] font-medium px-2 py-0 rounded-md bg-muted/60 border border-border/30 text-muted-foreground">
                            {getChannelPlatformLabel(group.channelType)}
                          </Badge>
                        </div>
                        <p className="text-[12px] text-muted-foreground">
                          ID: {group.channelType}:{account.accountId}
                        </p>
                        {agentName && (
                          <p className="text-[12px] text-muted-foreground">
                            Agent: {agentName}
                          </p>
                        )}

                        {/* Status badges */}
                        <div className="flex items-center gap-2 mt-2">
                          {account.configured && (
                            <Badge className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/20 hover:bg-green-500/20">
                              {t('account.connectionStatus.connected').includes('已') ? '已接入' : 'Connected'}
                            </Badge>
                          )}
                          {account.status === 'connected' && (
                            <Badge className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/20">
                              {t('account.connectionStatus.connected').includes('已') ? '在线' : 'Online'}
                            </Badge>
                          )}
                          {account.status === 'connecting' && (
                            <Badge className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20 animate-pulse hover:bg-yellow-500/20">
                              {t('account.connectionStatus.connecting')}
                            </Badge>
                          )}
                          {account.status === 'error' && (
                            <Badge className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20 hover:bg-red-500/20">
                              {t('account.connectionStatus.error')}
                            </Badge>
                          )}
                        </div>

                        {/* Description */}
                        {CHANNEL_META[group.channelType as ChannelType] && (
                          <p className="text-[12px] text-muted-foreground mt-2">
                            {group.channelType === 'wecom'
                              ? '企业微信 渠道接入后无需额外配对。'
                              : '点击卡片可进入这个 Bot 的配对管理。'}
                          </p>
                        )}

                        <p className="text-[12px] text-muted-foreground mt-1">
                          运行状态：{account.status === 'connected' ? '运行中' : account.status === 'connecting' ? '连接中' : account.status === 'error' ? '异常' : '未连接'}
                        </p>

                        {account.lastError && (
                          <p className="text-[11px] text-destructive mt-1">{account.lastError}</p>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-[12px] rounded-lg px-3 border-border/50 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            void handleBindAgent(group.channelType, account.accountId, '');
                          }}
                        >
                          {t('common:actions.disable', '禁用')}
                        </Button>
                        {CHANNEL_META[group.channelType as ChannelType] && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-[12px] rounded-lg px-3 border-border/50 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              void (async () => {
                                try {
                                  const accountParam = `?accountId=${encodeURIComponent(account.accountId)}`;
                                  const result = await hostApiFetch<{ success: boolean; values?: Record<string, string> }>(
                                    `/api/channels/config/${encodeURIComponent(group.channelType)}${accountParam}`
                                  );
                                  setInitialConfigValuesForModal(result.success ? (result.values || {}) : undefined);
                                } catch {
                                  setInitialConfigValuesForModal(undefined);
                                }
                                setSelectedChannelType(group.channelType as ChannelType);
                                setSelectedAccountId(account.accountId);
                                setAllowExistingConfigInModal(true);
                                setAllowEditAccountIdInModal(false);
                                setExistingAccountIdsForModal([]);
                                setShowConfigModal(true);
                              })();
                            }}
                          >
                            配对管理
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-[12px] rounded-lg px-3 border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-600"
                          onClick={() => setDeleteTarget({ channelType: group.channelType, accountId: account.accountId })}
                        >
                          {t('common:actions.delete', '删除')}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Empty state if no configured channels */}
          {configuredGroups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <p className="text-[14px]">{t('addChannel')}</p>
            </div>
          )}
        </div>
      </div>

      {showConfigModal && (
        <ChannelConfigModal
          initialSelectedType={selectedChannelType}
          accountId={selectedAccountId}
          configuredTypes={configuredTypes}
          allowExistingConfig={allowExistingConfigInModal}
          allowEditAccountId={allowEditAccountIdInModal}
          existingAccountIds={existingAccountIdsForModal}
          initialConfigValues={initialConfigValuesForModal}
          showChannelName={false}
          onClose={() => {
            setShowConfigModal(false);
            setSelectedChannelType(null);
            setSelectedAccountId(undefined);
            setAllowExistingConfigInModal(true);
            setAllowEditAccountIdInModal(false);
            setExistingAccountIdsForModal([]);
            setInitialConfigValuesForModal(undefined);
          }}
          onChannelSaved={async () => {
            await fetchPageData();
            setShowConfigModal(false);
            setSelectedChannelType(null);
            setSelectedAccountId(undefined);
            setAllowExistingConfigInModal(true);
            setAllowEditAccountIdInModal(false);
            setExistingAccountIdsForModal([]);
            setInitialConfigValuesForModal(undefined);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('common.confirm', 'Confirm')}
        message={deleteTarget?.accountId ? t('account.deleteConfirm') : t('deleteConfirm')}
        confirmLabel={t('common.delete', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="destructive"
        onConfirm={() => {
          void handleDelete();
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function ChannelLogo({ type }: { type: ChannelType }) {
  switch (type) {
    case 'telegram':
      return <img src={telegramIcon} alt="Telegram" className="w-[24px] h-[24px] dark:invert" />;
    case 'discord':
      return <img src={discordIcon} alt="Discord" className="w-[24px] h-[24px] dark:invert" />;
    case 'whatsapp':
      return <img src={whatsappIcon} alt="WhatsApp" className="w-[24px] h-[24px] dark:invert" />;
    case 'dingtalk':
      return <img src={dingtalkIcon} alt="DingTalk" className="w-[24px] h-[24px] dark:invert" />;
    case 'feishu':
      return <img src={feishuIcon} alt="Feishu" className="w-[24px] h-[24px] dark:invert" />;
    case 'wecom':
      return <img src={wecomIcon} alt="WeCom" className="w-[24px] h-[24px] dark:invert" />;
    case 'qqbot':
      return <img src={qqIcon} alt="QQ" className="w-[24px] h-[24px] dark:invert" />;
    default:
      return <span className="text-[24px]">{CHANNEL_ICONS[type] || '💬'}</span>;
  }
}

export default Channels;
