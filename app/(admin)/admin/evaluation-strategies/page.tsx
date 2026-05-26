import { redirect } from "next/navigation";

export default function AdminEvaluationStrategiesPage() {
    redirect("/admin/ai-strategies?category=EVALUATION");
}
