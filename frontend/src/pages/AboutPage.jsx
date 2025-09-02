import React from 'react';

function AboutPage() {
  const points = [
    "Real-time monitoring of key system resources, such as CPU load and memory, able to detect issues and initiate automated recoveries without manual intervention.",
    "Continuous network connectivity checks performed, quickly identifying and flagging potential outages or upstream problems.",
    "Automated speed tests are conducted regularly to assess actual broadband performance, highlighting underperformance and supporting SLA compliance.",
    "Every device reboot is logged with detailed reason codes, timestamps, and categorized by root cause for improved visibility and diagnostics."
  ];

  return (
    <div className="p-6 bg-white rounded-lg shadow-md text-gray-700 space-y-6">
      <h2 className="text-2xl font-bold text-tinno-green-600">About Self-Healing</h2>
      <p className="text-gray-600">
        Our intelligent self-healing system ensures uninterrupted broadband connectivity through proactive monitoring and automated recovery actions:
      </p>
      <ul className="space-y-4 list-disc list-inside">
        {points.map((point, index) => (
          <li key={index} className="leading-relaxed">{point}</li>
        ))}
      </ul>
    </div>
  );
}

export default AboutPage;
