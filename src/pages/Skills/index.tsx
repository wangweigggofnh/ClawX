/**
 * Skills Page
 * Browse and manage AI skills - Qclaw Lite design
 */
import { useEffect, useState, useCallback } from 'react';
import {
  Search,
  Puzzle,
  Lock,
  Package,
  X,
  AlertCircle,
  Plus,
  Key,
  Trash2,
  RefreshCw,
  FolderOpen,
  FileCode,
  Globe,
  Copy,
  Download,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useSkillsStore } from '@/stores/skills';
import { useGatewayStore } from '@/stores/gateway';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { cn } from '@/lib/utils';
import { invokeIpc } from '@/lib/api-client';
import { hostApiFetch } from '@/lib/host-api';
import { trackUiEvent } from '@/lib/telemetry';
import { toast } from 'sonner';
import type { Skill } from '@/types/skill';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';



// Skill detail dialog component
interface SkillDetailDialogProps {
  skill: Skill | null;
  isOpen: boolean;
  onClose: () => void;
  onToggle: (enabled: boolean) => void;
  onUninstall?: (slug: string) => void;
  onOpenFolder?: (skill: Skill) => Promise<void> | void;
}

function resolveSkillSourceLabel(skill: Skill, t: TFunction<'skills'>): string {
  const source = (skill.source || '').trim().toLowerCase();
  if (!source) {
    if (skill.isBundled) return t('source.badge.bundled', { defaultValue: 'Bundled' });
    return t('source.badge.unknown', { defaultValue: 'Unknown source' });
  }
  if (source === 'openclaw-bundled') return t('source.badge.bundled', { defaultValue: 'Bundled' });
  if (source === 'openclaw-managed') return t('source.badge.managed', { defaultValue: 'Managed' });
  if (source === 'openclaw-workspace') return t('source.badge.workspace', { defaultValue: 'Workspace' });
  if (source === 'openclaw-extra') return t('source.badge.extra', { defaultValue: 'Extra dirs' });
  if (source === 'agents-skills-personal') return t('source.badge.agentsPersonal', { defaultValue: 'Personal .agents' });
  if (source === 'agents-skills-project') return t('source.badge.agentsProject', { defaultValue: 'Project .agents' });
  return source;
}

function SkillDetailDialog({ skill, isOpen, onClose, onToggle, onUninstall, onOpenFolder }: SkillDetailDialogProps) {
  const { t } = useTranslation('skills');
  const { fetchSkills } = useSkillsStore();
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([]);
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!skill) return;
    if (skill.config?.apiKey) {
      setApiKey(String(skill.config.apiKey));
    } else {
      setApiKey('');
    }
    if (skill.config?.env) {
      const vars = Object.entries(skill.config.env).map(([key, value]) => ({
        key,
        value: String(value),
      }));
      setEnvVars(vars);
    } else {
      setEnvVars([]);
    }
  }, [skill]);

  const handleOpenClawhub = async () => {
    if (!skill?.slug) return;
    await invokeIpc('shell:openExternal', `https://clawhub.ai/s/${skill.slug}`);
  };

  const handleOpenEditor = async () => {
    if (!skill?.id) return;
    try {
      const result = await hostApiFetch<{ success: boolean; error?: string }>('/api/clawhub/open-readme', {
        method: 'POST',
        body: JSON.stringify({ skillKey: skill.id, slug: skill.slug, baseDir: skill.baseDir }),
      });
      if (result.success) {
        toast.success(t('toast.openedEditor'));
      } else {
        toast.error(result.error || t('toast.failedEditor'));
      }
    } catch (err) {
      toast.error(t('toast.failedEditor') + ': ' + String(err));
    }
  };

  const handleCopyPath = async () => {
    if (!skill?.baseDir) return;
    try {
      await navigator.clipboard.writeText(skill.baseDir);
      toast.success(t('toast.copiedPath'));
    } catch (err) {
      toast.error(t('toast.failedCopyPath') + ': ' + String(err));
    }
  };

  const handleAddEnv = () => {
    setEnvVars([...envVars, { key: '', value: '' }]);
  };

  const handleUpdateEnv = (index: number, field: 'key' | 'value', value: string) => {
    const newVars = [...envVars];
    newVars[index] = { ...newVars[index], [field]: value };
    setEnvVars(newVars);
  };

  const handleRemoveEnv = (index: number) => {
    const newVars = [...envVars];
    newVars.splice(index, 1);
    setEnvVars(newVars);
  };

  const handleSaveConfig = async () => {
    if (isSaving || !skill) return;
    setIsSaving(true);
    try {
      const envObj = envVars.reduce((acc, curr) => {
        const key = curr.key.trim();
        const value = curr.value.trim();
        if (key) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, string>);

      const result = await invokeIpc<{ success: boolean; error?: string }>(
        'skill:updateConfig',
        {
          skillKey: skill.id,
          apiKey: apiKey || '',
          env: envObj
        }
      ) as { success: boolean; error?: string };

      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }

      await fetchSkills();
      toast.success(t('detail.configSaved'));
    } catch (err) {
      toast.error(t('toast.failedSave') + ': ' + String(err));
    } finally {
      setIsSaving(false);
    }
  };

  if (!skill) return null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="w-full sm:max-w-[450px] p-0 flex flex-col border-l border-border/50 bg-background shadow-xl"
        side="right"
      >
        <div className="flex-1 overflow-y-auto px-8 py-10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 flex items-center justify-center rounded-full bg-muted/50 border border-border/30 shrink-0 mb-4 relative">
              <span className="text-3xl">{skill.icon || '🔧'}</span>
              {skill.isCore && (
                <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-1 border border-border/30">
                  <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                </div>
              )}
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2 text-center">{skill.name}</h2>
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="secondary" className="text-[11px] px-2 py-0.5 rounded-md">v{skill.version}</Badge>
              <Badge variant="secondary" className="text-[11px] px-2 py-0.5 rounded-md">
                {skill.isCore ? t('detail.coreSystem') : skill.isBundled ? t('detail.bundled') : t('detail.userInstalled')}
              </Badge>
            </div>
            {skill.description && (
              <p className="text-[13px] text-muted-foreground text-center leading-relaxed">{skill.description}</p>
            )}
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-[13px] font-bold text-foreground/80">{t('detail.source')}</h3>
              <Badge variant="secondary" className="text-[11px] px-2 py-0.5 rounded-md">{resolveSkillSourceLabel(skill, t)}</Badge>
              <div className="flex items-center gap-2">
                <Input
                  value={skill.baseDir || t('detail.pathUnavailable')}
                  readOnly
                  className="h-9 font-mono text-[12px] bg-muted/30 rounded-xl"
                />
                <Button variant="outline" size="icon" className="h-9 w-9" disabled={!skill.baseDir} onClick={handleCopyPath}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="h-9 w-9" disabled={!skill.baseDir} onClick={() => onOpenFolder?.(skill)}>
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {!skill.isCore && (
              <div className="space-y-2">
                <h3 className="text-[13px] font-bold flex items-center gap-2 text-foreground/80">
                  <Key className="h-3.5 w-3.5 text-blue-500" />
                  {t('detail.apiKey')}
                </h3>
                <Input
                  placeholder={t('detail.apiKeyPlaceholder', 'Enter API Key (optional)')}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  type="password"
                  className="h-10 font-mono text-[13px] bg-muted/30 rounded-xl"
                />
              </div>
            )}

            {!skill.isCore && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-bold text-foreground/80">{t('detail.envVars')}</h3>
                  <Button variant="ghost" size="sm" className="h-7 text-[12px]" onClick={handleAddEnv}>
                    <Plus className="h-3 w-3 mr-1" />
                    {t('detail.addVariable', 'Add Variable')}
                  </Button>
                </div>
                {envVars.map((env, index) => (
                  <div className="flex items-center gap-2" key={index}>
                    <Input value={env.key} onChange={(e) => handleUpdateEnv(index, 'key', e.target.value)} className="flex-1 h-9 font-mono text-[12px] bg-muted/30 rounded-xl" placeholder={t('detail.keyPlaceholder', 'Key')} />
                    <Input value={env.value} onChange={(e) => handleUpdateEnv(index, 'value', e.target.value)} className="flex-1 h-9 font-mono text-[12px] bg-muted/30 rounded-xl" placeholder={t('detail.valuePlaceholder', 'Value')} />
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive/70 hover:text-destructive" onClick={() => handleRemoveEnv(index)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {skill.slug && !skill.isBundled && !skill.isCore && (
              <div className="flex gap-2 justify-center pt-4">
                <Button variant="outline" size="sm" className="h-7 text-[11px] rounded-full px-3" onClick={handleOpenClawhub}>
                  <Globe className="h-3 w-3 mr-1" />ClawHub
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-[11px] rounded-full px-3" onClick={handleOpenEditor}>
                  <FileCode className="h-3 w-3 mr-1" />{t('detail.openManual')}
                </Button>
              </div>
            )}
          </div>

          <div className="pt-8 flex items-center justify-center gap-3">
            {!skill.isCore && (
              <Button onClick={handleSaveConfig} disabled={isSaving} className="flex-1 h-10 rounded-full bg-blue-500 hover:bg-blue-600 text-white font-semibold text-[13px]">
                {isSaving ? t('detail.saving') : t('detail.saveConfig')}
              </Button>
            )}
            {!skill.isCore && (
              <Button
                variant="outline"
                className="flex-1 h-10 rounded-full font-semibold text-[13px]"
                onClick={() => {
                  if (!skill.isBundled && onUninstall && skill.slug) {
                    onUninstall(skill.slug);
                    onClose();
                  } else {
                    onToggle(!skill.enabled);
                  }
                }}
              >
                {!skill.isBundled && onUninstall ? t('detail.uninstall') : (skill.enabled ? t('detail.disable') : t('detail.enable'))}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Skills() {
  const {
    skills,
    loading,
    error,
    fetchSkills,
    enableSkill,
    disableSkill,
    searchResults,
    searchSkills,
    installSkill,
    uninstallSkill,
    searching,
    searchError,
    installing
  } = useSkillsStore();
  const { t } = useTranslation('skills');
  const gatewayStatus = useGatewayStore((state) => state.status);
  const [searchQuery, setSearchQuery] = useState('');
  const [installQuery, setInstallQuery] = useState('');
  const [installSheetOpen, setInstallSheetOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [pluginExpanded, setPluginExpanded] = useState(true);

  const isGatewayRunning = gatewayStatus.state === 'running';
  const [showGatewayWarning, setShowGatewayWarning] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (!isGatewayRunning) {
      timer = setTimeout(() => { setShowGatewayWarning(true); }, 1500);
    } else {
      timer = setTimeout(() => { setShowGatewayWarning(false); }, 0);
    }
    return () => clearTimeout(timer);
  }, [isGatewayRunning]);

  useEffect(() => {
    if (isGatewayRunning) {
      fetchSkills();
    }
  }, [fetchSkills, isGatewayRunning]);

  const safeSkills = Array.isArray(skills) ? skills : [];
  const filteredSkills = safeSkills.filter((skill) => {
    const q = searchQuery.toLowerCase().trim();
    return q.length === 0 ||
      skill.name.toLowerCase().includes(q) ||
      skill.description.toLowerCase().includes(q) ||
      skill.id.toLowerCase().includes(q) ||
      (skill.slug || '').toLowerCase().includes(q);
  }).sort((a, b) => {
    if (a.enabled && !b.enabled) return -1;
    if (!a.enabled && b.enabled) return 1;
    if (a.isCore && !b.isCore) return -1;
    if (!a.isCore && b.isCore) return 1;
    return a.name.localeCompare(b.name);
  });

  const enabledCount = safeSkills.filter(s => s.enabled).length;
  const disabledCount = safeSkills.filter(s => !s.enabled).length;

  // Separate recommended (bundled/core) and plugin skills
  const recommendedSkills = filteredSkills.filter(s => s.isCore || s.isBundled).slice(0, 3);
  const pluginSkills = filteredSkills.filter(s => !s.isCore && !s.isBundled);

  const handleToggle = useCallback(async (skillId: string, enable: boolean) => {
    try {
      if (enable) {
        await enableSkill(skillId);
        toast.success(t('toast.enabled'));
      } else {
        await disableSkill(skillId);
        toast.success(t('toast.disabled'));
      }
    } catch (err) {
      toast.error(String(err));
    }
  }, [enableSkill, disableSkill, t]);

  const handleOpenSkillFolder = useCallback(async (skill: Skill) => {
    try {
      const result = await hostApiFetch<{ success: boolean; error?: string }>('/api/clawhub/open-path', {
        method: 'POST',
        body: JSON.stringify({ skillKey: skill.id, slug: skill.slug, baseDir: skill.baseDir }),
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to open folder');
      }
    } catch (err) {
      toast.error(t('toast.failedOpenActualFolder') + ': ' + String(err));
    }
  }, [t]);

  const [skillsDirPath, setSkillsDirPath] = useState('~/.openclaw/skills');

  useEffect(() => {
    invokeIpc<string>('openclaw:getSkillsDir')
      .then((dir) => setSkillsDirPath(dir as string))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!installSheetOpen) return;
    const query = installQuery.trim();
    if (query.length === 0) {
      searchSkills('');
      return;
    }
    const timer = setTimeout(() => { searchSkills(query); }, 300);
    return () => clearTimeout(timer);
  }, [installQuery, installSheetOpen, searchSkills]);

  const handleInstall = useCallback(async (slug: string) => {
    try {
      await installSkill(slug);
      await enableSkill(slug);
      toast.success(t('toast.installed'));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (['installTimeoutError', 'installRateLimitError'].includes(errorMessage)) {
        toast.error(t(`toast.${errorMessage}`, { path: skillsDirPath }), { duration: 10000 });
      } else {
        toast.error(t('toast.failedInstall') + ': ' + errorMessage);
      }
    }
  }, [installSkill, enableSkill, t, skillsDirPath]);

  const handleUninstall = useCallback(async (slug: string) => {
    try {
      await uninstallSkill(slug);
      toast.success(t('toast.uninstalled'));
    } catch (err) {
      toast.error(t('toast.failedUninstall') + ': ' + String(err));
    }
  }, [uninstallSkill, t]);

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

        {/* Search Bar */}
        <div className="flex items-center gap-2 mb-4 shrink-0">
          <div className="relative flex-1 flex items-center bg-muted/30 rounded-xl px-3 py-2 border border-border/30 focus-within:border-border/60 transition-colors">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              placeholder={t('search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ml-2 bg-transparent outline-none flex-1 text-[13px] text-foreground placeholder:text-muted-foreground/60"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground ml-1">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-xl border-border/30"
            onClick={() => {
              setInstallQuery('');
              setInstallSheetOpen(true);
            }}
          >
            <Globe className="h-4 w-4" />
          </Button>
        </div>

        {/* Stats */}
        <div className="text-[13px] text-muted-foreground mb-6 shrink-0">
          {t('filter.all', { count: safeSkills.length }).replace(/\(.*\)/, '')}
          共 {safeSkills.length} 个 · {enabledCount} 可用 · {disabledCount} 已禁用
        </div>

        {/* Gateway Warning */}
        {showGatewayWarning && (
          <div className="mb-4 p-3 rounded-xl border border-yellow-500/50 bg-yellow-500/10 flex items-center gap-3 shrink-0">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-yellow-700 dark:text-yellow-400 text-[13px] font-medium">{t('gatewayWarning')}</span>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-xl border border-destructive/50 bg-destructive/10 text-destructive text-[13px] font-medium flex items-center gap-2 shrink-0">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-6 min-h-0">

          {/* Recommended Skills Section */}
          {recommendedSkills.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[13px] font-medium text-muted-foreground">✨</span>
                <h2 className="text-[14px] font-semibold text-foreground">
                  推荐 Skills
                </h2>
              </div>
              <div className="space-y-3">
                {recommendedSkills.map((skill) => (
                  <div
                    key={skill.id}
                    className="rounded-2xl border border-border/50 bg-card/50 p-4 flex items-center justify-between gap-4 hover:bg-card/80 transition-colors cursor-pointer"
                    onClick={() => setSelectedSkill(skill)}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="h-10 w-10 shrink-0 flex items-center justify-center text-xl bg-muted/50 border border-border/30 rounded-xl">
                        {skill.icon || '🧩'}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-[14px] font-bold text-foreground">{skill.name}</h3>
                        <p className="text-[12px] text-muted-foreground line-clamp-1 mt-0.5">{skill.description}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-[12px] rounded-lg px-3 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!skill.enabled) {
                          handleToggle(skill.id, true);
                        }
                      }}
                    >
                      <Download className="h-3.5 w-3.5 mr-1" />
                      {skill.enabled ? t('detail.enabled') : t('common:actions.install', '安装')}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Plugin Skills Section */}
          <div>
            <button
              onClick={() => setPluginExpanded(!pluginExpanded)}
              className="flex items-center gap-2 mb-4 w-full text-left"
            >
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !pluginExpanded && "-rotate-90")} />
              <h2 className="text-[14px] font-semibold text-foreground">
                插件扩展 Skills
              </h2>
              <Badge variant="secondary" className="text-[11px] px-2 py-0.5 rounded bg-muted/50 border border-border/30 text-muted-foreground">
                {pluginSkills.length}
              </Badge>
            </button>

            {pluginExpanded && (
              <div className="space-y-1">
                {pluginSkills.map((skill) => (
                  <div
                    key={skill.id}
                    className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedSkill(skill)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-[14px] font-semibold text-foreground truncate">{skill.name}</span>
                      <span className="text-[12px] text-muted-foreground truncate">{skill.description}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={skill.enabled}
                        onCheckedChange={(checked) => handleToggle(skill.id, checked)}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          if (skill.slug) {
                            handleUninstall(skill.slug);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {pluginSkills.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-[13px]">
                    <Puzzle className="h-8 w-8 mx-auto mb-3 opacity-40" />
                    <p>{searchQuery ? t('noSkillsSearch') : t('noSkillsAvailable')}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* All bundled/core skills that aren't in the recommended section */}
          {filteredSkills.filter(s => (s.isCore || s.isBundled) && !recommendedSkills.includes(s)).length > 0 && (
            <div className="mt-6">
              <h2 className="text-[14px] font-semibold text-foreground mb-3">
                内置 Skills
              </h2>
              <div className="space-y-1">
                {filteredSkills.filter(s => (s.isCore || s.isBundled) && !recommendedSkills.includes(s)).map((skill) => (
                  <div
                    key={skill.id}
                    className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedSkill(skill)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-[14px] font-semibold text-foreground truncate">{skill.name}</span>
                      <span className="text-[12px] text-muted-foreground truncate">{skill.description}</span>
                      {skill.isCore && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                    </div>
                    <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={skill.enabled}
                        onCheckedChange={(checked) => handleToggle(skill.id, checked)}
                        disabled={skill.isCore}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Install Sheet */}
      <Sheet open={installSheetOpen} onOpenChange={setInstallSheetOpen}>
        <SheetContent
          className="w-full sm:max-w-[560px] p-0 flex flex-col border-l border-border/50 bg-background shadow-xl"
          side="right"
        >
          <div className="px-6 py-5 border-b border-border/30">
            <h2 className="text-lg font-bold text-foreground">{t('marketplace.installDialogTitle')}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{t('marketplace.installDialogSubtitle')}</p>
            <div className="mt-3 relative flex items-center bg-muted/30 rounded-xl px-3 py-2 border border-border/30">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                placeholder={t('searchMarketplace')}
                value={installQuery}
                onChange={(e) => setInstallQuery(e.target.value)}
                className="ml-2 h-auto border-0 bg-transparent p-0 shadow-none focus-visible:outline-none focus-visible:ring-0 text-[13px]"
              />
              {installQuery && (
                <button type="button" onClick={() => setInstallQuery('')} className="text-muted-foreground hover:text-foreground ml-1">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {searchError && (
              <div className="mb-4 p-3 rounded-xl border border-destructive/50 bg-destructive/10 text-destructive text-[13px] font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{t('marketplace.searchError')}</span>
              </div>
            )}
            {searching && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <LoadingSpinner size="lg" />
                <p className="mt-4 text-[13px]">{t('marketplace.searching')}</p>
              </div>
            )}
            {!searching && searchResults.length > 0 && (
              <div className="space-y-1">
                {searchResults.map((skill) => {
                  const isInstalled = safeSkills.some(s => s.id === skill.slug || s.name === skill.name);
                  const isInstallLoading = !!installing[skill.slug];
                  return (
                    <div
                      key={skill.slug}
                      className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => invokeIpc('shell:openExternal', `https://clawhub.ai/s/${skill.slug}`)}
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="h-9 w-9 shrink-0 flex items-center justify-center text-lg bg-muted/50 border border-border/30 rounded-xl">📦</div>
                        <div className="min-w-0">
                          <h3 className="text-[14px] font-semibold text-foreground truncate">{skill.name}</h3>
                          <p className="text-[12px] text-muted-foreground line-clamp-1">{skill.description}</p>
                        </div>
                      </div>
                      <div className="shrink-0 ml-3" onClick={(e) => e.stopPropagation()}>
                        {isInstalled ? (
                          <Button variant="destructive" size="sm" onClick={() => handleUninstall(skill.slug)} disabled={isInstallLoading} className="h-8 shadow-none">
                            {isInstallLoading ? <LoadingSpinner size="sm" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => handleInstall(skill.slug)} disabled={isInstallLoading} className="h-8 px-4 rounded-lg shadow-none text-[12px]">
                            {isInstallLoading ? <LoadingSpinner size="sm" /> : t('marketplace.install', 'Install')}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!searching && searchResults.length === 0 && !searchError && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Package className="h-8 w-8 mb-3 opacity-40" />
                <p className="text-[13px]">{installQuery.trim() ? t('marketplace.noResults') : t('marketplace.emptyPrompt')}</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <SkillDetailDialog
        skill={selectedSkill}
        isOpen={!!selectedSkill}
        onClose={() => setSelectedSkill(null)}
        onToggle={(enabled) => {
          if (!selectedSkill) return;
          handleToggle(selectedSkill.id, enabled);
          setSelectedSkill({ ...selectedSkill, enabled });
        }}
        onUninstall={handleUninstall}
        onOpenFolder={handleOpenSkillFolder}
      />
    </div>
  );
}

export default Skills;
