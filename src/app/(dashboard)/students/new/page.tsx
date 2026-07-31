import StudentForm from "@/components/StudentForm";

export default function NewStudentPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-800">Новий учень</h1>
      <StudentForm />
    </div>
  );
}