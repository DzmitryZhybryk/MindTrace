import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { SignUpPage } from "./pages/SignUpPage";

const SandboxPage = lazy(() =>
  import("./sandbox/SandboxPage").then((m) => ({ default: m.SandboxPage })),
);

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route
          path="/sandbox"
          element={
            <Suspense fallback={null}>
              <SandboxPage />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
