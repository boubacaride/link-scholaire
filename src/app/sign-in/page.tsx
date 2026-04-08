"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import Image from "next/image";

export default function SignInPage() {
  const router = useRouter();
  const { signIn, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn(email, password);
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.push("/admin");
    }
  };

  const handleDemoLogin = async (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("demo123456");
    setError("");
    setLoading(true);
    const result = await signIn(demoEmail, "demo123456");
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.push("/admin");
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left — Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 items-center justify-center p-12">
        <div className="max-w-md text-white">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <Image src="/logo.png" alt="SchoolFlow" width={32} height={32} />
            </div>
            <h1 className="text-3xl font-bold">SchoolFlow</h1>
          </div>
          <h2 className="text-4xl font-bold mb-4 leading-tight">
            Manage Your School,<br />
            <span className="text-blue-200">All in One Place.</span>
          </h2>
          <p className="text-blue-100 text-lg leading-relaxed">
            Grades, classes, content delivery, attendance, fees, and payroll —
            everything your school needs in a single platform.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4">
            <div className="bg-white/10 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold">5+</div>
              <div className="text-xs text-blue-200">User Roles</div>
            </div>
            <div className="bg-white/10 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold">LMS</div>
              <div className="text-xs text-blue-200">Built-In</div>
            </div>
            <div className="bg-white/10 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold">24/7</div>
              <div className="text-xs text-blue-200">Access</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right — Sign In Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <Image src="/logo.png" alt="SchoolFlow" width={32} height={32} />
            <h1 className="text-2xl font-bold text-gray-900">SchoolFlow</h1>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome back</h2>
          <p className="text-gray-500 mb-8">Sign in to your account to continue</p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@school.edu"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading || authLoading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          {/* Demo Accounts */}
          <div className="mt-8 border-t pt-6">
            <p className="text-xs text-gray-400 text-center mb-4 uppercase tracking-wide font-semibold">Quick Demo Access</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Admin", email: "admin@demo.edu", color: "bg-purple-50 text-purple-700 border-purple-200" },
                { label: "Teacher", email: "teacher@demo.edu", color: "bg-blue-50 text-blue-700 border-blue-200" },
                { label: "Student", email: "student@demo.edu", color: "bg-green-50 text-green-700 border-green-200" },
                { label: "Parent", email: "parent@demo.edu", color: "bg-orange-50 text-orange-700 border-orange-200" },
              ].map((demo) => (
                <button
                  key={demo.label}
                  type="button"
                  onClick={() => handleDemoLogin(demo.email)}
                  className={`py-2 px-3 border rounded-lg text-xs font-medium transition-colors hover:opacity-80 ${demo.color}`}
                >
                  {demo.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center mt-8">
            &copy; {new Date().getFullYear()} SchoolFlow. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
