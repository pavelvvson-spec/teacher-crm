import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-800">Головна сторінка</h1>
      <p className="text-gray-500">
        Тут з&apos;являться уроки на сьогодні, борги учнів і дохід за місяць — додамо це на наступних етапах.
      </p>
      <div className="flex gap-3">
        <Link
          href="/students/new"
          className="px-5 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700"
        >
          Додати учня
        </Link>
        <Link
          href="/calendar"
          className="px-5 py-3 bg-gray-200 text-gray-800 rounded-xl font-medium hover:bg-gray-300"
        >
          Створити урок
        </Link>
      </div>
    </div>
  );
}