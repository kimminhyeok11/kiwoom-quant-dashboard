import { trpc } from "@/lib/trpc";

type PresetLibraryProps = {
  onLoad: (expressionJson: unknown) => void;
};

export function PresetLibrary({ onLoad }: PresetLibraryProps) {
  const utils = trpc.useUtils();
  const { data: presets, isLoading } = trpc.conditionBuilder.list.useQuery();
  const deleteMutation = trpc.conditionBuilder.delete.useMutation({
    onSuccess: () => utils.conditionBuilder.list.invalidate(),
  });
  const duplicateMutation = trpc.conditionBuilder.duplicate.useMutation({
    onSuccess: () => utils.conditionBuilder.list.invalidate(),
  });

  function handleDelete(id: number, name: string) {
    if (window.confirm(`"${name}" 프리셋을 삭제하시겠습니까?`)) {
      deleteMutation.mutate({ id });
    }
  }

  function handleDuplicate(id: number) {
    duplicateMutation.mutate({ id });
  }

  function handleLoad(preset: { rulesJson: unknown }) {
    onLoad(preset.rulesJson);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-xs text-zinc-500">
        불러오는 중...
      </div>
    );
  }

  if (!presets || presets.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-xs text-zinc-500">
        저장된 프리셋이 없습니다
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {presets.map((preset) => (
        <div
          key={preset.id}
          className="flex flex-col gap-1 rounded border border-zinc-700 bg-zinc-800/50 p-2"
        >
          <div className="flex items-center justify-between">
            <span className="truncate text-xs font-medium text-zinc-200">
              {preset.name}
            </span>
          </div>
          <span className="text-[10px] text-zinc-500">
            {preset.createdAt
              ? new Date(preset.createdAt).toLocaleDateString("ko-KR")
              : ""}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => handleLoad(preset)}
              className="rounded bg-teal-600/80 px-2 py-0.5 text-[10px] text-white hover:bg-teal-600"
            >
              불러오기
            </button>
            <button
              type="button"
              onClick={() => handleDuplicate(preset.id)}
              className="rounded bg-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-600"
            >
              복제
            </button>
            <button
              type="button"
              onClick={() => handleDelete(preset.id, preset.name)}
              className="rounded bg-zinc-700 px-2 py-0.5 text-[10px] text-red-400 hover:bg-red-600/30"
            >
              삭제
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
