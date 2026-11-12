import React from 'react';
import { Button } from './Button';

export default {
  title: 'UI/Button',
  component: Button,
};

export const Primary = () => <Button variant="primary">Confirm Order</Button>;
export const Secondary = () => <Button variant="secondary">Cancel</Button>;
export const Danger = () => <Button variant="danger">Delete Line</Button>;
export const Ghost = () => <Button variant="ghost">View Details</Button>;
export const Loading = () => <Button variant="primary" loading>Saving...</Button>;
export const LargeTouch = () => <Button variant="primary" size="lg">Floor Touch Action (56px)</Button>;

