import { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../components/ui/Button.js';
import type { AppMetadata, ClarificationQuestion, ClarificationAnswer } from '../types/index.js';

export default function ClarificationPage() {
  const navigate = useNavigate();
  const { appId } = useParams<{ appId: string }>();
  const location = useLocation();
  const { questions, app } = location.state as {
    questions: ClarificationQuestion[];
    app: AppMetadata;
  };

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<ClarificationAnswer[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const currentQ = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;

  const handleNext = () => {
    if (selectedOption) {
      const newAnswers = [
        ...answers,
        { question: currentQ.question, answer: selectedOption },
      ];
      setAnswers(newAnswers);

      if (isLast) {
        // All questions answered, go to generation
        navigate(`/generate/${appId}`, {
          state: { app: { ...app, clarifications: newAnswers }, clarifications: newAnswers },
          replace: true,
        });
      } else {
        setCurrentIndex(currentIndex + 1);
        setSelectedOption(null);
      }
    }
  };

  const handleSkipAll = () => {
    navigate(`/generate/${appId}`, {
      state: { app, clarifications: [] },
      replace: true,
    });
  };

  const progress = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div className="flex flex-col h-full safe-top">
      {/* Header */}
      <div className="flex items-center px-4 py-3">
        <button onClick={() => navigate(-1)} className="text-text-muted p-2 -ml-2">
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold ml-2">Quick Questions</h1>
      </div>

      <div className="flex-1 px-5 pb-6 flex flex-col">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-text-dim mb-1">
            <span>Q{currentIndex + 1} of {questions.length}</span>
          </div>
          <div className="h-1 bg-surface-lighter rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        <p className="text-text-muted text-sm mb-6">
          A few quick questions to get it right
        </p>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }}
            className="flex-1"
          >
            <h2 className="text-lg font-semibold mb-4">{currentQ.question}</h2>

            <div className="flex flex-col gap-2">
              {currentQ.options.map((option) => (
                <button
                  key={option}
                  onClick={() => setSelectedOption(option)}
                  className={`text-left px-4 py-3 rounded-xl border transition-all ${
                    selectedOption === option
                      ? 'bg-primary/10 border-primary text-text'
                      : 'bg-surface-light border-surface-lighter text-text-muted hover:border-primary/40'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedOption === option
                          ? 'border-primary'
                          : 'border-surface-lighter'
                      }`}
                    >
                      {selectedOption === option && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-2.5 h-2.5 bg-primary rounded-full"
                        />
                      )}
                    </span>
                    {option}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-3 mt-4">
          <Button variant="ghost" onClick={handleSkipAll} className="flex-1">
            Skip All
          </Button>
          <Button
            onClick={handleNext}
            disabled={!selectedOption}
            className="flex-1"
          >
            {isLast ? 'Generate' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
