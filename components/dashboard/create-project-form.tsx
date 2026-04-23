"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Input, Modal, Space } from "antd";
import { FolderPlus, Hash, Plus, Type } from "lucide-react";
import {
  createProjectAction,
  type CreateProjectFormState,
} from "@/app/actions/projects";
import { useActionNotification } from "@/components/feedback/use-action-notification";

const initialState: CreateProjectFormState = {};

export function CreateProjectForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    createProjectAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);

  useActionNotification(state, {
    successTitle: "项目创建成功",
    errorTitle: "项目创建失败",
  });

  useEffect(() => {
    if (state.success) {
      const frame = requestAnimationFrame(() => {
        formRef.current?.reset();
        setOpen(false);
        setDialogKey((value) => value + 1);
        router.refresh();
      });

      return () => cancelAnimationFrame(frame);
    }
  }, [router, state.success]);

  return (
    <>
      <Button
        type="primary"
        icon={<Plus size={16} />}
        onClick={() => {
          setDialogKey((value) => value + 1);
          setOpen(true);
        }}
      >
        新建项目
      </Button>

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={640}
        destroyOnHidden
        title={
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>创建项目</div>
            <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
              平台管理员创建项目后，即可分配 AUTHOR / REVIEWER 并导入项目数据源。
            </div>
          </div>
        }
      >
        <Space
          key={dialogKey}
          direction="vertical"
          size={16}
          style={{ width: "100%", marginTop: 8 }}
        >
          <form ref={formRef} action={formAction}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <div>
                <label className="field-label" htmlFor="project-name">
                  项目名称
                </label>
                <Input
                  id="project-name"
                  name="name"
                  size="large"
                  prefix={<Type size={16} />}
                  placeholder="例如 数学基准测试"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="project-code">
                  项目标识
                </label>
                <Input
                  id="project-code"
                  name="code"
                  size="large"
                  prefix={<Hash size={16} />}
                  placeholder="例如 math-benchmark"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="project-description">
                  项目描述
                </label>
                <Input.TextArea
                  id="project-description"
                  name="description"
                  rows={4}
                  placeholder="可选，用于说明项目范围、数据来源或业务目标"
                />
              </div>

              <div>
                <Checkbox name="autoApplyAiStrategies" defaultChecked>
                  自动加入现有审核策略范围
                </Checkbox>
                <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  勾选后，当前项目会自动加入已配置“适用项目”的审核策略，无需再到审核策略页手动添加。
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 12,
                  marginTop: 8,
                }}
              >
                <Button onClick={() => setOpen(false)}>取消</Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<FolderPlus size={16} />}
                  loading={isPending}
                >
                  创建项目
                </Button>
              </div>
            </Space>
          </form>
        </Space>
      </Modal>
    </>
  );
}
