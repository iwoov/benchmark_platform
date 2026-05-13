"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Plus } from "lucide-react";
import {
  createProjectAction,
  type CreateProjectFormState,
} from "@/app/actions/projects";
import { useActionNotification } from "@/components/feedback/use-action-notification";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

const initialState: CreateProjectFormState = {};

export function CreateProjectForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    createProjectAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  useActionNotification(state, {
    successTitle: "项目创建成功",
    errorTitle: "项目创建失败",
  });

  useEffect(() => {
    if (state.success) {
      const frame = requestAnimationFrame(() => {
        formRef.current?.reset();
        setOpen(false);
        router.refresh();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [router, state.success]);

  return (
    <>
      <Button leftIcon={<Plus size={16} />} onClick={() => setOpen(true)}>
        新建项目
      </Button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="创建项目"
        description="平台管理员创建项目后，即可分配 AUTHOR / REVIEWER 并导入项目数据源。"
        width={640}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={isPending}>
              取消
            </Button>
            <Button
              form="create-project-form"
              type="submit"
              leftIcon={<FolderPlus size={16} />}
              loading={isPending}
            >
              创建项目
            </Button>
          </>
        }
      >
        <form
          id="create-project-form"
          ref={formRef}
          action={formAction}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <label htmlFor="project-name" className="text-sm font-medium text-foreground">
              项目名称
            </label>
            <Input id="project-name" name="name" placeholder="例如 数学基准测试" required />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="project-code" className="text-sm font-medium text-foreground">
              项目标识
            </label>
            <Input id="project-code" name="code" placeholder="例如 math-benchmark" required />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="project-description" className="text-sm font-medium text-foreground">
              项目描述
            </label>
            <Textarea
              id="project-description"
              name="description"
              rows={4}
              placeholder="可选，用于说明项目范围、数据来源或业务目标"
            />
          </div>

          <div className="space-y-1">
            <Checkbox
              name="autoApplyAiStrategies"
              defaultChecked
              label="自动加入现有审核策略范围"
            />
            <p className="pl-6 text-xs text-muted-foreground">
              勾选后，当前项目会自动加入已配置"适用项目"的审核策略，无需再到审核策略页手动添加。
            </p>
          </div>
        </form>
      </Modal>
    </>
  );
}
