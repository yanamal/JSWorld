async function fetchDebuggyHelp(state_before, player_code, execution_trace, deduction_tree, active_node) {
    // Replace with your deployed Cloudflare Worker URL
    const workerUrl = "https://debuggy.kuziavra.workers.dev";

    const state_data = { state_before, player_code, execution_trace, deduction_tree, active_node }

    console.log(state_data)

    try {
        const res = await fetch(workerUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(state_data),
        });

        if (!res.ok) {
            console.log('request failed')
            console.log(res)
        }

        const data = await res.json();
        console.log("AI Response:", data);
        return data;

    } catch (error) {
        console.error("Error calling AI:", error);
    }
}