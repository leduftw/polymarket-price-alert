import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Polymarket Price Alerts heading', () => {
  render(<App />);
  const heading = screen.getByText(/polymarket price alerts/i);
  expect(heading).toBeInTheDocument();
});
