import { z } from "zod";
import { auth } from "@/auth";
import { invokeAiModel } from "@/lib/ai/invoke";

const messagePartSchema = z.union([
  z.object({
    type: z.literal("text"),
    text: z.string().min(1, "文本内容不能为空"),
  }),
  z.object({
    type: z.literal("file"),
    fileUri: z.string().min(1, "文件地址不能为空"),
    mimeType: z.string().min(1, "文件类型不能为空"),
  }),
]);

const invokeAiSchema = z.object({
  modelCode: z.string().trim().min(1, "缺少模型名"),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.union([z.string(), z.array(messagePartSchema).min(1)]),
      }),
    )
    .min(1, "至少传入一条消息"),
  maxTokens: z.number().int().positive().max(32768).optional(),
  temperature: z.number().min(0).max(2).optional(),
  stream: z.boolean().optional(),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "未登录，无法调用 AI 服务。" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = invokeAiSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      {
        error: parsed.error.issues[0]?.message ?? "请求参数不合法。",
      },
      { status: 400 },
    );
  }

  const result = await invokeAiModel(parsed.data);

  if (!result.ok) {
    return Response.json(result, { status: 502 });
  }

  if (result.stream) {
    const headers = new Headers(result.response.headers);
    headers.set("x-ai-model-code", result.modelCode);
    headers.set("x-ai-provider-code", result.route.providerCode);
    headers.set("x-ai-endpoint-code", result.route.endpointCode);

    return new Response(result.response.body, {
      status: result.response.status,
      statusText: result.response.statusText,
      headers,
    });
  }

  return Response.json(result);
}
